/**
 * @file socket.viewing.ts
 * @description Khoá Redis "đang xem" `viewing:<userId>:<scopeKey>` (p1-07 be.md §9 — "Yêu cầu
 * p0-03"): người dùng có socket ở room `conv:`/`ch:` VÀ app đang foreground → không push tin
 * của luồng đó (NT-09). Worker fan-out/push KHÔNG có `getIO()` nên phải đọc qua Redis thay vì
 * `io.in(room).fetchSockets()` (cách cũ ở `delivery.policy.ts`, chỉ đúng trong tiến trình API).
 *
 * `scopeKey` = `CONVERSATION:<id>` | `CHANNEL:<id>` | `CHANNEL:<id>:<threadId>` — khớp cách
 * fan-out/push dựng `scopeKey` (`scope-key.ts` ở app). Bookkeeping theo SOCKET (Map bộ nhớ của
 * tiến trình giữ socket) để `room:leave`/background/disconnect xoá đúng khoá của socket đó.
 * Nhiều thiết bị cùng xem 1 luồng: 1 máy rời → khoá bị xoá tới nhịp heartbeat kế (≤ 30 s) của
 * máy còn lại — chấp nhận (README p1-07 §10: "tối đa ~1 push bị bỏ khi chuyển trạng thái").
 * Mọi thao tác Redis best-effort: lỗi chỉ log, KHÔNG làm hỏng handler socket.
 */
import { redis } from "../redis";
import { LIMITS } from "../../core/constants/limits";
import { logger } from "../logger";

const ROOM_PREFIX_TO_SCOPE: Record<string, string> = { conv: "CONVERSATION", ch: "CHANNEL" };

interface ViewState {
  active: boolean;
  threadId: string | null;
  keys: Set<string>;
}

const states = new Map<string, ViewState>();

export function viewingKey(userId: string, scopeKey: string): string {
  return `viewing:${userId}:${scopeKey}`;
}

/** `conv:abc` → `CONVERSATION:abc`; room khác (`user:`, `ws:`, …) → `null`. */
export function scopeKeyFromRoom(room: string): string | null {
  const idx = room.indexOf(":");
  if (idx < 0) return null;
  const scopeType = ROOM_PREFIX_TO_SCOPE[room.slice(0, idx)];
  return scopeType ? `${scopeType}:${room.slice(idx + 1)}` : null;
}

function desiredKeys(rooms: Iterable<string>, state: ViewState): Set<string> {
  const keys = new Set<string>();
  if (!state.active) return keys;
  for (const room of rooms) {
    const scopeKey = scopeKeyFromRoom(room);
    if (!scopeKey) continue;
    keys.add(scopeKey);
    if (state.threadId && scopeKey.startsWith("CHANNEL:")) keys.add(`${scopeKey}:${state.threadId}`);
  }
  return keys;
}

/**
 * Đồng bộ các khoá "đang xem" của 1 socket theo room hiện tại + trạng thái foreground.
 * Gọi sau `room:join`/`room:leave`, mỗi `presence:heartbeat` (gia hạn TTL) và khi disconnect.
 */
export async function syncViewing(
  socketId: string,
  userId: string,
  rooms: Iterable<string>,
  patch: { active?: boolean; threadId?: string | null } = {}
): Promise<void> {
  const state = states.get(socketId) ?? { active: true, threadId: null, keys: new Set<string>() };
  if (patch.active !== undefined) state.active = patch.active;
  if (patch.threadId !== undefined) state.threadId = patch.threadId;
  if (patch.active === false) state.threadId = null;
  states.set(socketId, state);

  const next = desiredKeys(rooms, state);
  const removed = [...state.keys].filter((k) => !next.has(k));
  state.keys = next;
  try {
    await Promise.all([
      ...[...next].map((k) => redis.set(viewingKey(userId, k), "1", LIMITS.notification.viewingTtlSeconds)),
      ...removed.map((k) => redis.del(viewingKey(userId, k))),
    ]);
  } catch (err) {
    logger.warn("[socket.viewing] Lỗi ghi khoá viewing, bỏ qua", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Socket ngắt — xoá mọi khoá viewing do socket này đặt (gọi ở `disconnecting`, khi `socket.rooms` còn nguyên). */
export async function dropViewing(socketId: string, userId: string): Promise<void> {
  const state = states.get(socketId);
  states.delete(socketId);
  if (!state || state.keys.size === 0) return;
  try {
    await Promise.all([...state.keys].map((k) => redis.del(viewingKey(userId, k))));
  } catch (err) {
    logger.warn("[socket.viewing] Lỗi xoá khoá viewing, để TTL tự hết", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Worker/API đọc: người dùng đang xem đúng luồng này ở foreground? Redis lỗi → `false` (vẫn push, an toàn hơn bỏ sót). */
export async function isViewing(userId: string, scopeKey: string): Promise<boolean> {
  try {
    return await redis.exists(viewingKey(userId, scopeKey));
  } catch {
    return false;
  }
}
