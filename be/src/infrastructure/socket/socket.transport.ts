/**
 * @file socket.transport.ts
 * @description Chọn đường phát cho `socket.emit.ts`/`socket.sessions.ts`: có `Server` (API/`all`) → phát TRỰC TIẾP như cũ (Redis adapter lo
 * fan-out giữa các instance API); không có nhưng đã bật cầu nối (worker, `initSocketBridge()`) → ghi lên Redis qua emitter; không có cả hai
 * (script, test, API trước `initSocketServer()`) → ném ĐÚNG lỗi cũ của `getIO()` để nơi gọi best-effort tiếp tục bắt như trước.
 */
import type { Server } from "socket.io";
import { getIO, tryGetIO } from "./socket.server";
import { getSocketBridge, type BroadcastOp, type SocketBridge } from "./socket.bridge";

export type SocketTransport =
  | { kind: "io"; io: Server; broadcaster: BroadcastOp }
  | { kind: "bridge"; bridge: SocketBridge; broadcaster: BroadcastOp };

export function resolveTransport(): SocketTransport {
  const io = tryGetIO();
  if (io) return { kind: "io", io, broadcaster: io };
  const bridge = getSocketBridge();
  if (bridge) return { kind: "bridge", bridge, broadcaster: bridge.broadcaster };
  // Không có đường nào — `getIO()` ném lỗi gốc "[Socket] Socket.IO chưa được khởi tạo…" (hành vi trước khi có cầu nối).
  const fallback = getIO();
  return { kind: "io", io: fallback, broadcaster: fallback };
}
