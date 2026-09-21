import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "../config/env.js";
import type { EventRecord } from "../services/eventService.js";

let io: SocketIOServer | undefined;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  io.on("connection", (socket) => {
    console.log(`[socket] client connected: ${socket.id}`);
    socket.on("disconnect", () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function requireIo(): SocketIOServer {
  if (!io) throw new Error("Socket.IO not initialized — call initSocket() first");
  return io;
}

export function broadcastNewEvent(event: EventRecord): void {
  requireIo().emit("event:new", event);
}

export function broadcastUpdatedEvent(event: EventRecord): void {
  requireIo().emit("event:updated", event);
}
