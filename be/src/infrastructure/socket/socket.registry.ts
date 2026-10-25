/**
 * @file socket.registry.ts
 * @description Registry kết nối `userId → {socketId, deviceId, platform}`
 * trên Redis (be.md p0-03 §1/§4) — sống được qua nhiều instance server (khác
 * `io.sockets` chỉ biết socket TRÊN instance hiện tại). Dùng HASH
 * `conn:{userId}` (socketId → JSON), TTL 120s làm mới mỗi lần
 * `presence:heartbeat` (`presence.handler.ts`) — instance chết mà không kịp
 * `disconnect` (crash) tự dọn theo TTL thay vì để lại bản ghi ma mãi mãi.
 *
 * Dùng `redis` (client node-redis chung), KHÔNG dùng `queueConnection`
 * (ioredis riêng của BullMQ) — đây là dữ liệu kết nối realtime, không phải
 * job.
 */
import { redis } from "../redis";
import { logger } from "../logger";
import { env } from "../../core/config";

/** be.md §4 — `conn:{userId}` EX 120, làm mới mỗi heartbeat (30s < 120s nên luôn kịp gia hạn trước khi hết hạn). */
const CONN_TTL_SECONDS = 120;

export interface ConnectionInfo {
  deviceId: string;
  platform: string;
  instanceId: string;
  connectedAt: string;
}

function connKey(userId: string): string {
  return `conn:${userId}`;
}

/** Ghi 1 kết nối mới — gọi lúc `connection` (`socket.server.ts`). */
export async function registryAdd(userId: string, socketId: string, info: ConnectionInfo): Promise<void> {
  try {
    await redis.hset(connKey(userId), socketId, JSON.stringify(info));
    await redis.expire(connKey(userId), CONN_TTL_SECONDS);
  } catch (err) {
    logger.warn("[socket.registry] Không thể ghi connection registry", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Xoá 1 kết nối — gọi lúc `disconnect`. */
export async function registryRemove(userId: string, socketId: string): Promise<void> {
  try {
    await redis.hdel(connKey(userId), socketId);
  } catch (err) {
    logger.warn("[socket.registry] Không thể xoá connection registry", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Gia hạn TTL của registry — gọi mỗi `presence:heartbeat` để kết nối còn beat không bị hết hạn giữa chừng. */
export async function registryTouch(userId: string): Promise<void> {
  try {
    await redis.expire(connKey(userId), CONN_TTL_SECONDS);
  } catch {
    // best-effort — TTL không gia hạn kịp chỉ làm registry hết hạn sớm hơn dự kiến, không chặn heartbeat
  }
}

/** Toàn bộ kết nối đang mở của 1 user (mọi instance) — dùng cho debug/đếm thiết bị. */
export async function registryList(userId: string): Promise<Record<string, ConnectionInfo>> {
  const raw = await redis.hgetall(connKey(userId));
  const out: Record<string, ConnectionInfo> = {};
  for (const [socketId, json] of Object.entries(raw)) {
    try {
      out[socketId] = JSON.parse(json) as ConnectionInfo;
    } catch {
      // bản ghi hỏng (không nên xảy ra, luôn ghi qua registryAdd) — bỏ qua thay vì throw
    }
  }
  return out;
}

/** Số thiết bị đang kết nối của 1 user — dùng cho `presence.service` (be.md §5.4 "vẫn ONLINE nếu còn ≥1 thiết bị"). */
export async function registryCount(userId: string): Promise<number> {
  return Object.keys(await registryList(userId)).length;
}

/**
 * Đếm số user đang online + tổng số socket đang mở, xuyên suốt MỌI instance
 * (dùng cho `GET /admin/overview` — p0-03 admin.md mục "realtime"). `SCAN`
 * thay `KEYS` để không chặn Redis khi số kết nối lớn; O(n) theo số user đang
 * online — chấp nhận được vì caller (`admin-overview.service.ts`) tự cache
 * kết quả 30s, không gọi hàm này mỗi request.
 */
export async function registryCountAll(): Promise<{ onlineUsers: number; socketConnections: number }> {
  try {
    const keys = await redis.scanKeys("conn:*");
    const hashes = await Promise.all(keys.map((key) => redis.hgetall(key)));
    const socketConnections = hashes.reduce((sum, h) => sum + Object.keys(h).length, 0);
    return { onlineUsers: keys.length, socketConnections };
  } catch (err) {
    logger.warn("[socket.registry] Không đếm được connection registry", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { onlineUsers: 0, socketConnections: 0 };
  }
}

/** Xây `ConnectionInfo` cho socket đang connect — dùng chung 1 nơi để `instanceId`/`connectedAt` luôn nhất quán. */
export function buildConnectionInfo(deviceId: string, platform: string): ConnectionInfo {
  return {
    deviceId,
    platform,
    instanceId: env.INSTANCE_ID,
    connectedAt: new Date().toISOString(),
  };
}
