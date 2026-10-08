/**
 * End-to-end smoke test against a running server (npm start).
 * Two users register, onboard, queue, get matched, join the room, send transcript
 * segments, exchange a signaling message, end the call, and read their own feedback.
 *
 *   npx tsx scripts/smoke.ts [http://localhost:4000]
 */
import type { ClientToServerEvents, ServerToClientEvents } from "@linguamatch/shared";
import { io, type Socket } from "socket.io-client";

const BASE = process.argv[2] ?? "http://localhost:4000";
type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

async function api(path: string, opts: { method?: string; body?: unknown; token?: string; cookie?: string } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const refreshCookie = res.headers.getSetCookie().find((c) => c.startsWith("lm_refresh=") && !c.startsWith("lm_refresh=;"));
  return { status: res.status, json: text ? JSON.parse(text) : null, cookie: refreshCookie?.split(";")[0] };
}

function once<E extends keyof ServerToClientEvents>(s: ClientSocket, event: E, ms = 10_000) {
  return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    (s as unknown as Socket).once(event as string, (payload: never) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

function check(cond: unknown, label: string) {
  if (!cond) throw new Error(`FAILED: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function makeUser(name: string, level: string, nativeLanguage: string) {
  const suffix = Math.random().toString(36).slice(2, 7);
  const reg = await api("/auth/register", {
    body: { username: `${name}_${suffix}`, email: `${name}${suffix}@example.com`, password: "password123" },
  });
  check(reg.status === 201 && reg.cookie && reg.json?.accessToken, `${name} registered (access token + refresh cookie)`);
  const refreshed = await api("/auth/refresh", { cookie: reg.cookie, body: {} });
  check(refreshed.status === 200 && refreshed.json?.accessToken && refreshed.cookie, `${name} refreshed the session`);
  const token: string = refreshed.json.accessToken;
  const onboard = await api("/me/onboarding", {
    token,
    body: { nativeLanguage, targetLanguage: "en", level, acceptRules: true, transcriptionConsent: true },
  });
  check(onboard.json?.user?.onboarded, `${name} onboarded (${nativeLanguage} → en ${level})`);
  const socket: ClientSocket = io(BASE, { auth: { token }, transports: ["websocket"] });
  await new Promise<void>((r, j) => {
    socket.on("connect", () => r());
    socket.on("connect_error", j);
  });
  return { token, socket };
}

async function main() {
  const health = await api("/health");
  console.log("health:", JSON.stringify(health.json));
  check((await fetch(`${BASE}/health`)).status === 200, "/health liveness probe");

  const unauth = await api("/me/profile");
  check(unauth.status === 401, "unauthenticated request rejected");
  check((await api("/auth/refresh", { body: {} })).status === 401, "refresh without cookie rejected");

  const anon = io(BASE, { transports: ["websocket"], reconnection: false });
  const anonError = await new Promise<Error>((r) => anon.on("connect_error", r));
  check(anonError.message === "unauthorized", "socket without token rejected");
  anon.close();

  const a = await makeUser("alice", "B1", "mn");
  const b = await makeUser("bora", "B1", "ko");

  const statusA = once(a.socket, "queue:status");
  a.socket.emit("queue:join", { targetLanguage: "en" });
  check((await statusA).waiting === 1, "alice waiting alone in queue");

  const matchedA = once(a.socket, "queue:matched");
  const matchedB = once(b.socket, "queue:matched");
  b.socket.emit("queue:join", { targetLanguage: "en" });
  const [ma, mb] = await Promise.all([matchedA, matchedB]);
  check(ma.roomId === mb.roomId, `both matched into room ${ma.roomId}`);
  const roomId = ma.roomId;

  const readyA = once(a.socket, "room:ready");
  const readyB = once(b.socket, "room:ready");
  const waiting = once(a.socket, "room:waiting-partner");
  a.socket.emit("room:join", { roomId });
  await waiting;
  check(true, "alice told to wait for partner");
  b.socket.emit("room:join", { roomId });
  const [ra, rb] = await Promise.all([readyA, readyB]);
  check(ra.role === "caller" && rb.role === "callee", "roles assigned caller/callee");
  check(ra.partner.displayName.startsWith("bora") && !("userId" in ra.partner), "partner info excludes ids/email");
  check(ra.iceServers.length > 0, "ICE servers provided");

  const sig = once(b.socket, "signal");
  a.socket.emit("signal", { roomId, data: { type: "offer", sdp: "v=0 fake" } });
  check((await sig).data.type === "offer", "signaling relayed to partner only");

  const now = Date.now();
  const lines = [
    "um I am agree with you about the big city",
    "yesterday I go to the gym and it was very good",
    "I think living in small town is good because is quiet and people is friendly",
    "but the big city have more jobs and more good restaurants you know",
  ];
  for (const [i, text] of lines.entries()) {
    a.socket.emit("transcript:segment", { roomId, text, startedAt: now + i * 4000, endedAt: now + i * 4000 + 3500, confidence: 0.85 });
    await new Promise((r) => setTimeout(r, 300));
  }

  const endedB = once(b.socket, "room:ended");
  const endedA = once(a.socket, "room:ended");
  a.socket.emit("room:leave", { roomId, reason: "ended" });
  const [ea, eb] = await Promise.all([endedA, endedB]);
  check(!ea.byPartner && eb.byPartner, "both notified; bora sees partner ended");

  await new Promise((r) => setTimeout(r, 1500));
  const fa = await api(`/conversations/${roomId}/feedback`, { token: a.token });
  const fb = await api(`/conversations/${roomId}/feedback`, { token: b.token });
  console.log(`  alice feedback: ${fa.json?.feedback?.status} — ${fa.json?.feedback?.statusMessage ?? ""}`);
  console.log(`  alice metrics: ${JSON.stringify(fa.json?.feedback?.metrics)}`);
  console.log(`  bora feedback:  ${fb.json?.feedback?.status} — ${fb.json?.feedback?.statusMessage ?? ""}`);
  check(fa.json?.feedback?.metrics?.wordCount > 25, "alice's own transcript was captured and measured");
  check(fb.json?.feedback?.status === "insufficient_data", "bora (silent) gets an honest insufficient-data report");

  const block = await api(`/conversations/${roomId}/block`, { token: b.token, body: {} });
  check(block.status === 201, "bora blocks alice via conversation id");
  const report = await api(`/conversations/${roomId}/report`, { token: b.token, body: { reason: "spam" } });
  check(report.status === 201, "bora reports alice");

  // Blocked users must never be re-matched, even after waiting.
  let matchedAgain = false;
  a.socket.once("queue:matched", () => (matchedAgain = true));
  b.socket.once("queue:matched", () => (matchedAgain = true));
  a.socket.emit("queue:join", { targetLanguage: "en" });
  b.socket.emit("queue:join", { targetLanguage: "en" });
  await new Promise((r) => setTimeout(r, 2500));
  check(!matchedAgain, "blocked pair not re-matched");
  a.socket.emit("queue:leave");
  b.socket.emit("queue:leave");

  const profile = await api("/me/profile", { token: a.token });
  check(profile.json?.profile?.totals?.conversations === 1, "profile counts the conversation");

  a.socket.close();
  b.socket.close();
  console.log("\nSmoke test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
