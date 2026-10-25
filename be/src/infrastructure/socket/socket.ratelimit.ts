/**
 * @file socket.ratelimit.ts
 * @description Token bucket IN-MEMORY theo socket (be.md p0-03 §5.7) — chặn
 * spam sự kiện client trước khi tới handler. Rẻ và đủ cho chống spam cơ bản;
 * KHÔNG cần Redis (mỗi instance tự giữ bucket của socket đang mở TRÊN instance
 * đó, không cần đồng bộ chéo instance vì 1 socket luôn thuộc đúng 1 instance).
 *
 * Đăng ký qua `registerRateLimiter(socket)` NGAY sau khi socket connect,
 * TRƯỚC mọi `socket.on(...)` khác — packet middleware (`socket.use`) chặn ở
 * tầng thấp nhất, handler không cần tự kiểm lại.
 */
import type { Socket } from "socket.io";
import { LIMITS } from "../../core/constants/limits";
import { ErrorCode } from "../../core/utils/error.codes";
import { SocketEvent } from "./socket.events";
import { ackErr, extractAck } from "./socket.ack";
import { logger } from "../logger";
import { socketEventsTotal } from "../metrics";

type RateLimitCategory = keyof typeof LIMITS.realtime.rateLimit;

/** Whitelist sự kiện C→S — bất kỳ tên nào khác bị bỏ (be.md §5.7: "không trong whitelist → bỏ + log debug"). */
const ALLOWED_EVENTS = new Set<string>([
  SocketEvent.JOIN_ROOM,
  SocketEvent.LEAVE_ROOM,
  SocketEvent.PRESENCE_HEARTBEAT,
  SocketEvent.PRESENCE_SET,
  SocketEvent.TYPING_START,
  SocketEvent.TYPING_STOP,
  SocketEvent.AUTH_REFRESH,
  SocketEvent.QUIZ_ANSWER,
]);

// Map (thay vì switch) — `event` tham số là `string` thô (tên sự kiện packet
// C→S), so nó với case label kiểu `SocketEvent` khiến eslint báo
// no-unsafe-enum-comparison dù giá trị runtime giống hệt (enum string).
const CATEGORY_BY_EVENT: Partial<Record<string, RateLimitCategory>> = {
  [SocketEvent.TYPING_START]: "typing",
  [SocketEvent.TYPING_STOP]: "typing",
  [SocketEvent.PRESENCE_HEARTBEAT]: "presence",
  [SocketEvent.PRESENCE_SET]: "presence",
  [SocketEvent.JOIN_ROOM]: "room",
  [SocketEvent.LEAVE_ROOM]: "room",
  [SocketEvent.AUTH_REFRESH]: "authRefresh",
  [SocketEvent.QUIZ_ANSWER]: "quizAnswer",
};

function categoryForEvent(event: string): RateLimitCategory | null {
  return CATEGORY_BY_EVENT[event] ?? null;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

/** `socketId -> category -> bucket`. Dọn trong `clearRateLimit()` lúc disconnect — tránh rò rỉ bộ nhớ. */
const buckets = new Map<string, Map<RateLimitCategory, BucketState>>();

function refill(state: BucketState, capacity: number, refillPerSecond: number, nowMs: number): void {
  const elapsedSeconds = Math.max(0, (nowMs - state.lastRefillMs) / 1000);
  state.tokens = Math.min(capacity, state.tokens + elapsedSeconds * refillPerSecond);
  state.lastRefillMs = nowMs;
}

/** Tiêu 1 token cho `category` của `socketId` — `false` nếu hết token (bị chặn). Export để unit test gọi trực tiếp không cần dựng Socket.IO thật. */
export function consumeToken(socketId: string, category: RateLimitCategory, nowMs = Date.now()): boolean {
  const { capacity, refillPerSecond } = LIMITS.realtime.rateLimit[category];
  let perSocket = buckets.get(socketId);
  if (!perSocket) {
    perSocket = new Map();
    buckets.set(socketId, perSocket);
  }
  let state = perSocket.get(category);
  if (!state) {
    state = { tokens: capacity, lastRefillMs: nowMs };
    perSocket.set(category, state);
  }
  refill(state, capacity, refillPerSecond, nowMs);
  if (state.tokens < 1) return false;
  state.tokens -= 1;
  return true;
}

/** Xoá bucket của 1 socket — gọi lúc `disconnect` (`socket.server.ts`). */
export function clearRateLimit(socketId: string): void {
  buckets.delete(socketId);
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearAllRateLimits(): void {
  buckets.clear();
}

/**
 * Gắn packet middleware giới hạn kích thước + tần suất sự kiện C→S. Không
 * forward event tới handler (không gọi `next()`) khi: (1) tên sự kiện không
 * trong whitelist, (2) payload vượt `clientEventMaxBytes`, (3) hết token —
 * (2)/(3) còn phản hồi ack `RT_413`/`RT_429` nếu client có truyền callback.
 */
export function registerRateLimiter(socket: Socket): void {
  socket.use((packet, next) => {
    const [event, payload] = packet as [string, unknown];
    const ack = extractAck(packet);

    if (!ALLOWED_EVENTS.has(event)) {
      logger.debug("[socket.ratelimit] Sự kiện ngoài whitelist, bỏ qua", { event, socketId: socket.id });
      socketEventsTotal.inc({ event, result: "rejected" });
      return;
    }

    const byteLength = Buffer.byteLength(JSON.stringify(payload ?? null));
    if (byteLength > LIMITS.realtime.clientEventMaxBytes) {
      ack?.(ackErr(ErrorCode.RT_413));
      socketEventsTotal.inc({ event, result: "rejected" });
      return;
    }

    const category = categoryForEvent(event);
    if (category && !consumeToken(socket.id, category)) {
      ack?.(ackErr(ErrorCode.RT_429));
      socketEventsTotal.inc({ event, result: "rejected" });
      return;
    }

    next();
  });
}
