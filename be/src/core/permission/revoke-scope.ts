import { logger } from "../../infrastructure/logger";
import type { ScopeRef } from "./scope.types";
import { getResolver } from "./scope-registry";
import { bumpVersion } from "./permission.cache";
import { getPermissionPorts } from "./ports";

export interface RevokeInput {
  scope: ScopeRef;
  userIds: string[];
  reason:
    | "REMOVED"
    | "BANNED"
    | "LEFT"
    | "GRANT_REVOKED"
    | "ARCHIVED"
    | "DISSOLVED"
    | "ROLE_CHANGED"
    | "ANONYMIZED"
    // p3-04 — khách hết hạn (`MembershipLifecycleService.expireGuest`); app đã nhận reason này (`PermissionRevokedPayload`).
    | "EXPIRED";
  /** Mặc định `true` — gọi `resolver.children()` để lan version-bump/leave-room xuống scope con. */
  cascade?: boolean;
}

/**
 * Listener sau thu hồi (p2-01 be.md §5.11) — module ngoài `core` (vd `calls`) đăng ký để phản ứng với MỌI đường thu hồi
 * quyền/đóng phạm vi mà không phải sửa từng nơi gọi `revokeScope()` (members, conversations, channels, workspaces…).
 * Khoá theo `name` (đăng ký lại cùng tên thì thay thế — import lặp/hot-reload không nhân đôi). Listener chạy SAU khi
 * bump version + đá room + phát `permission:revoked`; lỗi của listener chỉ log, KHÔNG làm hỏng API thu hồi quyền.
 */
export type RevokeListener = (input: RevokeInput) => Promise<void> | void;
const revokeListeners = new Map<string, RevokeListener>();

export function registerRevokeListener(name: string, listener: RevokeListener): void {
  revokeListeners.set(name, listener);
}

/** Chỉ dùng trong test. */
export function clearRevokeListeners(): void {
  revokeListeners.clear();
}

/** Tên các listener đã đăng ký (đã sắp xếp) — CHỈ đọc, dùng cho test parity API ↔ worker (`revokeScope` cũng chạy ở worker). */
export function listRevokeListenerNames(): string[] {
  return [...revokeListeners.keys()].sort();
}

async function notifyListeners(input: RevokeInput): Promise<void> {
  for (const [name, listener] of revokeListeners) {
    try {
      await listener(input);
    } catch (err) {
      logger.warn("[permission] revokeScope: listener lỗi, bỏ qua", {
        listener: name,
        scope: input.scope,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Pipeline thu hồi quyền (be.md §5.4). Caller đã commit thay đổi
 * membership/grant trong transaction TRƯỚC khi gọi hàm này — hàm này chỉ lo
 * phần "làm cho quyền cũ hết hiệu lực ở mọi nơi đang cache/kết nối nó",
 * KHÔNG ghi audit (trách nhiệm của caller, be.md §5.4 bước 7).
 */
export async function revokeScope(input: RevokeInput): Promise<void> {
  const { scope, userIds, reason, cascade = true } = input;
  const resolver = getResolver(scope.type);

  let childScopes: ScopeRef[] = [];
  if (cascade && resolver?.children) {
    try {
      childScopes = await resolver.children(scope.id);
    } catch (err) {
      logger.error("[permission] revokeScope: children() lỗi, chỉ xử lý scope gốc", {
        scope,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const scopes = [scope, ...childScopes];

  // 1) Bump version — mọi khoá cache cũ tự vô hiệu (kể cả khi Redis lỗi,
  // bumpVersion() tự lo retry qua outbox — không chặn pipeline ở đây).
  let rootVersion = 0;
  for (const s of scopes) {
    const version = await bumpVersion(s);
    if (s.type === scope.type && s.id === scope.id) rootVersion = version;
  }

  // 2) Đá mọi socket của các user này khỏi room của scope (+ scope con).
  const rooms = scopes.flatMap((s) => getResolver(s.type)?.roomsFor?.(s.id) ?? []);
  const ports = getPermissionPorts();
  if (userIds.length > 0 && rooms.length > 0) {
    await ports.realtime.leaveRooms(userIds, rooms);
  }

  // 3) Báo cho mọi thiết bị của user đồng bộ lại UI — 1 sự kiện cho scope
  // gốc, client tự hiểu scope con qua `cascade`.
  if (userIds.length > 0) {
    await ports.realtime.emitToUsers(userIds, "permission:revoked", {
      v: 1,
      scopeType: scope.type,
      scopeId: scope.id,
      version: rootVersion,
      reason,
      cascade,
    });
  }

  // 4) Huỷ push đang chờ theo scope (p0-06 sẽ implement processor tiêu thụ job này).
  // Best-effort — KHÔNG throw khi Redis/BullMQ tạm mất kết nối (cùng triết lý
  // "Redis down → cho qua" mà `bumpVersion()` phía trên đã áp dụng): bước 1-3
  // (bump version, đá room, báo permission:revoked) đã xong — không để việc
  // xếp job dọn push chờ (phụ, không bắt buộc) làm cả API remove/ban/leave
  // trả 500 dù state đã đổi thật (phát hiện lúc viết test tích hợp p1-02 gọi
  // `revokeScope()` với `enqueueNow` thật — trước đó `revoke-scope.test.ts`
  // chỉ dùng port giả nên chưa lộ ra).
  try {
    await ports.outbox.enqueueNow("push.cancel-scope", {
      userIds,
      scopeType: scope.type,
      scopeId: scope.id,
      version: rootVersion,
    });
  } catch (err) {
    logger.warn("[permission] revokeScope: enqueueNow(push.cancel-scope) lỗi, bỏ qua", {
      scope,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 5) Listener module ngoài core (p2-01 `calls`: đá participant/kết thúc cuộc gọi của phạm vi bị thu hồi).
  await notifyListeners(input);
}
