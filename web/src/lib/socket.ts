"use client";

import type { ClientToServerEvents, ServerToClientEvents } from "@linguamatch/shared";
import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import { getFreshAccessToken, refreshSession } from "./api";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * - connecting:   first attempt in progress
 * - connected:    live
 * - unreachable:  can't reach the server (asleep, waking up, or offline); socket.io keeps retrying
 * - reconnecting: was connected and dropped; socket.io keeps retrying
 * - auth_error:   the server rejected a freshly refreshed token, so retrying won't help
 */
export type SocketStatus = "connecting" | "connected" | "unreachable" | "reconnecting" | "auth_error";

// Next.js inlines NEXT_PUBLIC_* at build time. The localhost fallback is for `npm run dev` only;
// next.config.ts fails a Vercel build that doesn't set it.
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

let socket: AppSocket | null = null;
let status: SocketStatus = "connecting";
const statusListeners = new Set<() => void>();

function setStatus(next: SocketStatus) {
  if (next === status) return;
  status = next;
  statusListeners.forEach((l) => l());
}

const statusStore = {
  get: () => status,
  subscribe: (listener: () => void) => {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  },
};

export function useSocketStatus(): SocketStatus {
  return useSyncExternalStore(statusStore.subscribe, statusStore.get, () => "connecting");
}

function createSocket(): AppSocket {
  const s: AppSocket = io(SOCKET_URL, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15_000,
    randomizationFactor: 0.5,
    timeout: 20_000,
    // Runs before every connection attempt, so each reconnect carries a valid access token.
    // Auth goes in the handshake payload, not cookies: the socket server is on another site.
    auth: (cb) => {
      getFreshAccessToken().then(
        (token) => cb({ token }),
        () => cb({ token: null }), // server unreachable; the handshake will fail and be retried
      );
    },
  });

  // After a server-side "unauthorized" we refresh once and reconnect once.
  let authRetried = false;

  s.on("connect", () => {
    authRetried = false;
    setStatus("connected");
  });
  s.on("disconnect", (reason) => {
    // A client-initiated disconnect (logout) isn't a connection problem.
    if (reason !== "io client disconnect") setStatus("reconnecting");
  });
  s.on("connect_error", (err) => {
    if (err.message !== "unauthorized") {
      // Network error, timeout or cold start. socket.io retries with backoff on its own.
      setStatus(s.active ? "unreachable" : "auth_error");
      return;
    }
    // The server rejected the token. socket.io doesn't retry middleware errors, so we do,
    // once. If the refresh itself is rejected, the auth context sends the user to /login.
    if (authRetried) {
      setStatus("auth_error");
      return;
    }
    authRetried = true;
    refreshSession().then(
      (user) => {
        if (user && socket === s) s.connect();
      },
      () => {
        // Couldn't reach the server to refresh: treat as a network problem and try again shortly.
        authRetried = false;
        setStatus("unreachable");
        setTimeout(() => socket === s && !s.connected && s.connect(), 5000);
      },
    );
  });
  return s;
}

/**
 * One socket per tab, shared across pages so moving from /match to /room keeps the
 * connection (and the server-side queue/room membership) alive.
 */
export function getSocket(): AppSocket {
  socket ??= createSocket();
  if (!socket.connected && !socket.active) {
    setStatus("connecting");
    socket.connect();
  }
  return socket;
}

/** The current socket without creating or connecting one. */
export function currentSocket(): AppSocket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  setStatus("connecting");
}
