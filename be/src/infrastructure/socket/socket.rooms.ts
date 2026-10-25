import type { Server, Socket } from "socket.io";
import { logger } from "../logger";
import type { SocketData } from "./socket.server";

/**
 * Cho socket tham gia phòng theo roomId.
 */
export async function joinRoom(socket: Socket, roomId: string): Promise<void> {
  await socket.join(roomId);
  logger.info(`[Socket] ${socket.id} joined room: ${roomId}`);
}

/**
 * Cho socket rời phòng theo roomId.
 */
export async function leaveRoom(socket: Socket, roomId: string): Promise<void> {
  await socket.leave(roomId);
  logger.info(`[Socket] ${socket.id} left room: ${roomId}`);
}

/**
 * Phát sự kiện đến tất cả socket trong một phòng.
 *
 * ⚠️ LEGACY (tiền-p0-03, nhận `io` tường minh) — giữ lại CHỈ vì
 * `modules/notifications/jobs/notification.jobs.ts` đang dùng qua barrel
 * `@infrastructure/socket`. Code MỚI KHÔNG dùng 2 hàm này (`emitToUser` bên
 * dưới cũng vậy) — dùng `emitToRoom`/`emitToUsers`/`emitToScope`/`leaveRooms`
 * ở `@infrastructure/socket/socket.emit` (tự thêm `v`/`serverNow`, không cần
 * truyền `io` tay, xem `reuse-first.md`).
 */
export function emitToRoom(io: Server, roomId: string, event: string, data: unknown): void {
  io.to(roomId).emit(event, data);
}

/**
 * Phát sự kiện đến một user cụ thể (user đã join room riêng theo userId).
 * Convention: mỗi user khi connect sẽ tự join room `user:<userId>`.
 *
 * ⚠️ LEGACY — xem ghi chú ở `emitToRoom` ngay trên. Dùng `emitToUsers` (số
 * nhiều, nhận mảng `userIds`) ở `@infrastructure/socket/socket.emit` cho code mới.
 */
export function emitToUser(io: Server, userId: string, event: string, data: unknown): void {
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Tên phòng chuẩn — mọi nơi build room name phải qua đây, không tự ghép chuỗi.
 * 9 kind đủ theo be.md p0-03 §1: `user ws ch conv call meet board quiz admin`.
 */
export const ROOM = {
  user: (id: string) => `user:${id}`,
  workspace: (id: string) => `ws:${id}`,
  channel: (id: string) => `ch:${id}`,
  conversation: (id: string) => `conv:${id}`,
  call: (id: string) => `call:${id}`,
  meeting: (id: string) => `meet:${id}`,
  board: (id: string) => `board:${id}`,
  quiz: (id: string) => `quiz:${id}`,
  admin: (topic: string) => `admin:${topic}`,
} as const;

/** Mã lỗi ack khi từ chối join — phân biệt "không thấy" (404) và "thấy nhưng thiếu quyền" (403), be.md p0-02 §6. */
export type RoomJoinDenyCode = "PERM_404" | "PERM_001";

/** Kết quả chi tiết — cho phép guard phân biệt 404/403 thay vì chỉ true/false. */
export interface GuardResult {
  joinable: boolean;
  code?: RoomJoinDenyCode;
}

/**
 * Guard có thể trả `boolean` (tiền lệ — vd guard "user" trong `socket.server.ts`)
 * HOẶC `GuardResult` chi tiết (dùng bởi `infrastructure/socket/socket.guards.ts`
 * — permission theo scope cần phân biệt 404/403). `resolveJoinable` tự chuẩn
 * hoá cả 2 dạng, guard cũ không cần sửa gì.
 */
type Guard = (user: SocketData["user"], id: string) => Promise<boolean | GuardResult>;
const guards = new Map<string, Guard>();

/** Module đăng ký guard cho tiền tố room lúc khởi tạo (ví dụ "ch" → kiểm channelAccess). */
export function registerRoomGuard(prefix: string, guard: Guard): void {
  guards.set(prefix, guard);
}

/** Xoá toàn bộ guard đã đăng ký — chỉ dùng trong test để cô lập giữa các case. */
export function clearRoomGuards(): void {
  guards.clear();
}

function normalizeGuardResult(result: boolean | GuardResult): GuardResult {
  return typeof result === "boolean" ? { joinable: result } : result;
}

/**
 * Trả room hợp lệ (`room`) hoặc lý do từ chối (`code`). Không có guard đăng
 * ký cho `kind`, hoặc `kind`/`id` sai định dạng → từ chối mặc định đóng
 * (`PERM_404`) — an toàn hơn là mặc định mở với room chưa có module xử lý.
 */
export async function resolveJoinable(
  user: SocketData["user"],
  kind: string,
  id: string
): Promise<{ room: string | null; code?: RoomJoinDenyCode }> {
  // `admin:{topic}` (p1-08 — `admin:moderation`) dùng TÊN CHỦ ĐỀ chữ thường thay vì ObjectId; mọi kind khác vẫn bắt buộc ObjectId.
  const idPattern = kind === "admin" ? /^[a-z][a-z0-9-]{0,31}$/ : /^[0-9a-fA-F]{24}$/;
  if (!/^[a-z-]{1,20}$/.test(kind ?? "") || !idPattern.test(id ?? "")) {
    return { room: null, code: "PERM_404" };
  }
  const guard = guards.get(kind);
  if (!guard) return { room: null, code: "PERM_404" };

  const result = normalizeGuardResult(await guard(user, id));
  if (!result.joinable) return { room: null, code: result.code ?? "PERM_404" };
  return { room: `${kind}:${id}` };
}
