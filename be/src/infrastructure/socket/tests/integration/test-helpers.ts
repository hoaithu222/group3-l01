/**
 * Boilerplate dùng chung cho các test tích hợp Socket.IO của p0-03
 * (room/typing/presence/auth-refresh) — KHÔNG phải harness `p0-10` liên-module
 * (`src/tests/integration/socket-harness.ts`, chưa tồn tại, để package đó tự
 * quyết định khi build), chỉ gói lại phần khởi `http.Server` thật +
 * `socket.io-client` thật lặp lại giống hệt nhau ở mỗi file test dưới đây.
 */
import http from "http";
import type { AddressInfo } from "net";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { Server } from "socket.io";
import { initSocketServer } from "../../socket.server";
import { JwtUtils } from "../../../../core/utils/jwt";

export interface Harness {
  httpServer: http.Server;
  io: Server;
  port: number;
}

export async function startHarness(): Promise<Harness> {
  const httpServer = http.createServer();
  const io = initSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  return { httpServer, io, port };
}

export async function stopHarness(h: Harness): Promise<void> {
  await h.io.close();
  await new Promise<void>((resolve) => h.httpServer.close(() => resolve()));
}

export interface ConnectAuth {
  token: string;
  deviceId?: string;
  platform?: string;
  appVersion?: string;
}

export function connectClient(port: number, auth: ConnectAuth): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth,
      transports: ["websocket"],
      reconnection: false,
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });
}

export function tokenFor(userId: string, email: string, sv = 1): string {
  return JwtUtils.generateAccessToken({ userId, email, role: "user", sv });
}

/** `emit(event, payload, ack)` dạng Promise — dùng khi test chỉ cần đợi đúng 1 ack. */
export function emitWithAck<T = unknown>(client: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    client.emit(event, payload, (ack: T) => resolve(ack));
  });
}
