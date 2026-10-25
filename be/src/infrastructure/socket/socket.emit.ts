/**
 * @file socket.emit.ts
 * @description Lớp chuẩn hoá DUY NHẤT để phát sự kiện server→client (be.md
 * p0-03 §5.6) — mọi payload đi qua đây tự động có `v: 1` + `serverNow` (ISO),
 * để client tính offset đồng hồ mà không cần đoán field nào có/thiếu.
 *
 * `permission-ports.ts` (p0-02 `RealtimePort`) gọi qua `emitToUsers`/`leaveRooms`
 * ở đây thay vì `getIO()` trực tiếp — MỌI nơi khác trong codebase (kể cả
 * module Phase 1+) cũng PHẢI qua đây, không tự `io.to(...).emit(...)` và KHÔNG
 * tự `getIO()` (reuse-first.md).
 *
 * ── Chạy được ở CẢ API lẫn worker ──────────────────────────────────────────
 * Tiến trình API/`all` có `Server` → phát TRỰC TIẾP như trước (Redis adapter fan-out giữa các instance API). Tiến trình worker
 * (`worker.ts`) KHÔNG có `Server` nhưng đã bật cầu nối (`initSocketBridge()`) → cùng các lời gọi này ghi lên Redis bằng
 * `@socket.io/redis-emitter`, mọi instance API nhận đúng MỘT lần (xem `socket.bridge.ts`). Chữ ký công khai không đổi; đường phát do
 * `resolveTransport()` (`socket.transport.ts`) chọn. Ở worker các hàm KHÔNG ném khi Redis lỗi/chậm (bỏ sự kiện + log) — sự kiện cần
 * bền phải đi qua outbox + consumer, không dựa vào emit.
 */
import { ROOM } from "./socket.rooms";
import type { Action, ScopeRef, ScopeType } from "../../core/permission";
import { logger } from "../logger";
import { BRIDGE_RECHECK_EVENT } from "./socket.bridge";
import { emitToSocketsWithRecheck } from "./socket.bridge.listener";
import { resolveTransport } from "./socket.transport";

interface Envelope {
  v: number;
  serverNow: string;
}

/**
 * Chuẩn hoá payload S→C: thêm `v: 1` + `serverNow` (ISO) nếu thiếu (README
 * §2 "Payload"). Export để nơi cần emit trực tiếp qua `socket.to()` (vd
 * `typing.handler.ts` — phải loại trừ chính người gửi, `emitToRoom` không
 * làm được việc đó) vẫn dùng chung 1 khuôn payload, không tự ghép tay.
 */
export function stampPayload<T extends object>(payload: T): T & Envelope {
  return { v: 1, serverNow: new Date().toISOString(), ...payload };
}

/**
 * Phát 1 sự kiện tới TẤT CẢ socket trong 1 room — dùng khi room đã xác định sẵn (vd `ch:{id}`, `conv:{id}`).
 * `exceptUserIds` (tuỳ chọn, p1-08): loại trừ mọi thiết bị của các user này khỏi lượt phát (vd presence
 * KHÔNG gửi tới người đã chặn/bị chặn) — Socket.IO `except(user:{id}…)`, fan-out đúng qua Redis Adapter.
 */
export function emitToRoom(room: string, event: string, payload: object, exceptUserIds?: string[]): void {
  const { broadcaster } = resolveTransport();
  const target = broadcaster.to(room);
  const scoped = exceptUserIds && exceptUserIds.length > 0 ? target.except(exceptUserIds.map(ROOM.user)) : target;
  scoped.emit(event, stampPayload(payload));
}

/** Phát 1 sự kiện tới room riêng (`user:{id}`) của từng user — mọi thiết bị của họ đều nhận. */
export function emitToUsers(userIds: string[], event: string, payload: object): void {
  if (userIds.length === 0) return;
  const { broadcaster } = resolveTransport();
  broadcaster.to(userIds.map(ROOM.user)).emit(event, stampPayload(payload));
}

/**
 * Phát 1 sự kiện tới TOÀN BỘ kết nối đang mở (qua Redis Adapter ở production
 * — fan-out mọi instance) — dùng cho thông báo hệ thống không gắn với 1 room
 * nghiệp vụ cụ thể (vd `config:updated`, p0-07 §6). ⚠️ Ngoại lệ DUY NHẤT cho
 * `io.emit(...)` toàn cục trong codebase — mọi nơi KHÁC vẫn phải dùng
 * `emitToRoom/emitToUsers/emitToScope` (reuse-first.md).
 */
export function emitToAll(event: string, payload: object): void {
  const { broadcaster } = resolveTransport();
  broadcaster.emit(event, stampPayload(payload));
}

/** Ánh xạ `ScopeType` → room Socket.IO tương ứng — khớp `ROOM.*`/`socket.guards.ts` (ws/ch/conv/call/meet). */
const ROOM_BY_SCOPE_TYPE: Partial<Record<ScopeType, (id: string) => string>> = {
  WORKSPACE: ROOM.workspace,
  CHANNEL: ROOM.channel,
  CONVERSATION: ROOM.conversation,
  MEETING: ROOM.meeting,
  CALL: ROOM.call,
  BOARD: ROOM.board,
};

export interface EmitToScopeOptions {
  /**
   * Gọi lại `PermissionService.can()` cho TỪNG socket trong room trước khi
   * emit riêng — dùng cho nội dung nhạy cảm ngay sau khi quyền vừa bị thu hồi
   * (socket có thể chưa kịp bị `leaveRooms` đá ra, be.md §5.6). Tốn hơn
   * emit thường (`fetchSockets()` qua adapter) — chỉ dùng khi thật sự cần.
   * Ở worker (không có socket để liệt kê) lệnh được uỷ quyền cho MỌI instance API qua Redis (`serverSideEmit`): mỗi instance kiểm quyền
   * và phát cho socket cục bộ của nó.
   */
  recheck?: Action;
  /** Loại trừ 1 user khỏi lượt phát này (vd không gửi lại cho chính người gửi). */
  excludeUserId?: string;
}

/** Phát 1 sự kiện tới room của 1 scope nghiệp vụ (`{type, id}` → room qua `ROOM_BY_SCOPE_TYPE`). */
export async function emitToScope(
  scope: ScopeRef,
  event: string,
  payload: object,
  opts: EmitToScopeOptions = {}
): Promise<void> {
  const room = ROOM_BY_SCOPE_TYPE[scope.type]?.(scope.id);
  if (!room) {
    logger.warn("[socket.emit] emitToScope: không có room cho scope type này", { scope });
    return;
  }

  const transport = resolveTransport();
  const enveloped = stampPayload(payload);

  if (!opts.recheck) {
    const target = transport.broadcaster.to(room);
    (opts.excludeUserId ? target.except(ROOM.user(opts.excludeUserId)) : target).emit(event, enveloped);
    return;
  }

  if (transport.kind === "bridge") {
    // Worker không liệt kê được socket ⇒ uỷ quyền cho MỌI instance API; mỗi instance chỉ xử lý socket cục bộ nên không phát trùng.
    transport.bridge.serverSideEmit(BRIDGE_RECHECK_EVENT, {
      room,
      event,
      payload: enveloped,
      scope,
      recheck: opts.recheck,
      excludeUserId: opts.excludeUserId,
    });
    return;
  }

  const sockets = await transport.io.in(room).fetchSockets();
  await emitToSocketsWithRecheck(sockets, {
    event,
    payload: enveloped,
    scope,
    recheck: opts.recheck,
    excludeUserId: opts.excludeUserId,
  });
}

/** Buộc mọi socket đang mở của các user này rời khỏi danh sách room (KHÔNG disconnect) — fan-out qua mọi instance nhờ Redis Adapter (worker: qua emitter). */
export function leaveRooms(userIds: string[], rooms: string[]): void {
  if (userIds.length === 0 || rooms.length === 0) return;
  const { broadcaster } = resolveTransport();
  broadcaster.in(userIds.map(ROOM.user)).socketsLeave(rooms);
}

/** Cho mọi socket đang mở của các user này tự join thêm danh sách room (vd vừa chấp nhận lời mời vào workspace, be.md p1-02 §5.3) — fan-out qua mọi instance nhờ Redis Adapter (worker: qua emitter). */
export function joinRooms(userIds: string[], rooms: string[]): void {
  if (userIds.length === 0 || rooms.length === 0) return;
  const { broadcaster } = resolveTransport();
  broadcaster.in(userIds.map(ROOM.user)).socketsJoin(rooms);
}
