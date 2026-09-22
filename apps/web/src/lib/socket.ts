import { io, type Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | undefined;

/** Singleton Socket.IO client connected to the API's realtime event feed. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL);
  }
  return socket;
}
