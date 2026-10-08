import { isTargetLanguage } from "@linguamatch/shared";
import { parse as parseCookie } from "cookie";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env";
import { Matchmaker, QueueError } from "../services/matchmaking/matchmaker";
import {
  addTranscriptSegment,
  createConversationFromMatch,
  endConversation,
  handleSocketDisconnect,
  joinRoom,
  relaySignal,
  requestTopic,
} from "../services/rooms/roomService";
import { AUTH_COOKIE, verifyToken } from "../utils/auth";
import { setIO, userRoom, type AppSocket, type IO } from "./io";

export let matchmaker: Matchmaker;

/** Wraps a handler so a thrown error is logged instead of crashing the process. */
function safe<A extends unknown[]>(socket: AppSocket, fn: (...args: A) => Promise<void> | void) {
  return (...args: A) => {
    Promise.resolve()
      .then(() => fn(...args))
      .catch((err) => {
        console.error(`[socket] ${socket.data.userId}:`, err);
      });
  };
}

const isRoomId = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{24}$/i.test(v);

export function createSocketServer(httpServer: HttpServer): IO {
  const io: IO = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    maxHttpBufferSize: 64 * 1024,
  });
  setIO(io);

  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? "");
    const userId = verifyToken(cookies[AUTH_COOKIE] ?? (socket.handshake.auth?.token as string | undefined));
    if (!userId) return next(new Error("unauthorized"));
    socket.data.userId = userId;
    next();
  });

  matchmaker = new Matchmaker(createConversationFromMatch);
  matchmaker.start();

  io.on("connection", (socket: AppSocket) => {
    const userId = socket.data.userId;
    void socket.join(userRoom(userId));

    socket.on(
      "queue:join",
      safe(socket, async (payload) => {
        if (!isTargetLanguage(payload?.targetLanguage)) {
          socket.emit("queue:error", { message: "Unsupported language" });
          return;
        }
        try {
          await matchmaker.join(userId, socket.id, payload.targetLanguage);
        } catch (err) {
          if (err instanceof QueueError) socket.emit("queue:error", { message: err.message });
          else throw err;
        }
      }),
    );

    socket.on("queue:leave", safe(socket, () => matchmaker.leave(userId)));

    socket.on(
      "room:join",
      safe(socket, async (payload) => {
        if (isRoomId(payload?.roomId)) await joinRoom(socket, payload.roomId);
      }),
    );

    socket.on(
      "room:leave",
      safe(socket, async (payload) => {
        if (!isRoomId(payload?.roomId)) return;
        await endConversation(payload.roomId, userId, payload.reason === "next" ? "next" : "ended");
      }),
    );

    socket.on(
      "signal",
      safe(socket, async (payload) => {
        if (!isRoomId(payload?.roomId) || !payload.data || typeof payload.data !== "object") return;
        await relaySignal(socket, payload.roomId, payload.data);
      }),
    );

    socket.on(
      "topic:request",
      safe(socket, async (payload) => {
        if (isRoomId(payload?.roomId)) await requestTopic(socket, payload.roomId);
      }),
    );

    socket.on(
      "transcript:segment",
      safe(socket, async (payload) => {
        if (isRoomId(payload?.roomId)) await addTranscriptSegment(socket, payload);
      }),
    );

    socket.on(
      "disconnect",
      safe(socket, async () => {
        handleSocketDisconnect(socket);
        // Only drop the queue entry if this was the socket that queued.
        const remaining = await io.in(userRoom(userId)).fetchSockets();
        if (remaining.length === 0) await matchmaker.leave(userId, "expired");
      }),
    );
  });

  return io;
}
