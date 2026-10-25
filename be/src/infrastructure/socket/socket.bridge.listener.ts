/**
 * @file socket.bridge.listener.ts
 * @description Phía API của cầu nối worker → socket (`socket.bridge.ts`).
 *
 * `emit`/`socketsJoin`/`socketsLeave`/`disconnectSockets` từ worker KHÔNG cần listener: `@socket.io/redis-adapter` (đã gắn ở `socket.server.ts`)
 * tự nhận gói của `@socket.io/redis-emitter`. Chỉ `emitToScope({ recheck })` cần code phía API vì nó phải ĐỌC danh sách socket (`fetchSockets`)
 * — thứ worker không có: worker gửi lệnh `serverSideEmit` tới MỌI instance API, mỗi instance kiểm quyền và phát cho socket CỤC BỘ của mình
 * (`.local`) ⇒ mỗi socket nhận tối đa một lần, không cần CAS/khoá giữa các instance.
 *
 * `emitToSocketsWithRecheck` là phần lõi dùng chung với đường trực tiếp của `emitToScope` (API tự gọi) để hai đường không lệch nhau.
 */
import type { Server } from "socket.io";
import { permissionService, type Action, type ScopeRef, type ScopeType } from "../../core/permission";
import type { AuthUser } from "../../core/types/express";
import { logger } from "../logger";
import { BRIDGE_RECHECK_EVENT, type BridgeRecheckCommand } from "./socket.bridge";

/** Socket cục bộ hoặc `RemoteSocket` (từ `fetchSockets()`) — chỉ cần `data` + `emit`. */
export interface RecheckableSocket {
  data: unknown;
  emit(event: string, ...args: unknown[]): unknown;
}

export interface RecheckEmit {
  event: string;
  /** Đã có envelope `v`/`serverNow`. */
  payload: object;
  scope: ScopeRef;
  recheck: Action;
  excludeUserId?: string;
}

/** Gọi lại `PermissionService.can()` cho TỪNG socket rồi mới emit riêng cho socket đó (nội dung nhạy cảm ngay sau khi quyền vừa bị thu hồi). */
export async function emitToSocketsWithRecheck(sockets: readonly RecheckableSocket[], cmd: RecheckEmit): Promise<void> {
  await Promise.all(
    sockets.map(async (socket) => {
      const user = (socket.data as { user?: AuthUser }).user;
      if (!user) return;
      if (cmd.excludeUserId && user.id === cmd.excludeUserId) return;
      const allowed = await permissionService.can(user, cmd.recheck, cmd.scope);
      if (allowed) socket.emit(cmd.event, cmd.payload);
    })
  );
}

const SCOPE_TYPES: ReadonlySet<string> = new Set<ScopeType>(["WORKSPACE", "CHANNEL", "CONVERSATION", "MEETING", "CALL", "BOARD"]);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Lệnh đến từ Redis (do worker/instance khác ghi) — kiểm hình dạng, sai thì bỏ (fail-closed: không phát gì). */
function parseRecheckCommand(raw: unknown): BridgeRecheckCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const cmd = raw as Partial<BridgeRecheckCommand>;
  const scope = cmd.scope as Partial<ScopeRef> | undefined;
  if (!isNonEmptyString(cmd.room) || !isNonEmptyString(cmd.event) || !isNonEmptyString(cmd.recheck)) return null;
  if (!cmd.payload || typeof cmd.payload !== "object") return null;
  if (!scope || !isNonEmptyString(scope.type) || !SCOPE_TYPES.has(scope.type) || !isNonEmptyString(scope.id)) return null;
  if (cmd.excludeUserId !== undefined && typeof cmd.excludeUserId !== "string") return null;
  return { room: cmd.room, event: cmd.event, payload: cmd.payload, scope: { type: scope.type, id: scope.id }, recheck: cmd.recheck, excludeUserId: cmd.excludeUserId };
}

export async function handleBridgeRecheck(io: Server, raw: unknown): Promise<void> {
  const cmd = parseRecheckCommand(raw);
  if (!cmd) {
    logger.warn("[socket.bridge] Lệnh recheck không hợp lệ, bỏ qua");
    return;
  }
  try {
    // `.local`: mỗi instance chỉ lo socket của chính nó — tránh N instance cùng fetch toàn cụm rồi phát trùng.
    const sockets = await io.in(cmd.room).local.fetchSockets();
    await emitToSocketsWithRecheck(sockets, {
      event: cmd.event,
      payload: cmd.payload,
      scope: cmd.scope as ScopeRef,
      recheck: cmd.recheck as Action,
      excludeUserId: cmd.excludeUserId,
    });
  } catch (err) {
    logger.warn("[socket.bridge] Xử lý lệnh recheck lỗi", { event: cmd.event, error: err instanceof Error ? err.message : String(err) });
  }
}

/** Gọi 1 lần ở `initSocketServer()` — sự kiện `serverSideEmit` chỉ do server ghi lên Redis, client KHÔNG thể gửi tới đây. */
export function registerSocketBridgeListeners(io: Server): void {
  io.on(BRIDGE_RECHECK_EVENT, (raw: unknown) => {
    void handleBridgeRecheck(io, raw);
  });
}
