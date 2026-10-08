"use client";

import type { ClientToServerEvents, ServerToClientEvents } from "@linguamatch/shared";
import { io, type Socket } from "socket.io-client";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/**
 * One socket per tab, shared across pages so moving from /match to /room keeps the
 * connection (and the server-side queue/room membership) alive. Auth uses the
 * httpOnly session cookie sent with the handshake.
 */
export function getSocket(): AppSocket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000", {
      withCredentials: true,
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
