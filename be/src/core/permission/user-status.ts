import { prisma } from "../../infrastructure/database";
import { redis } from "../../infrastructure/redis";

export interface UserStatusSnapshot {
  status: string;
  sessionVersion: number;
  /** p0-03 — `User.privacy.showPresence` (mặc định `true`) — cache kèm để `presence.service` không phải query Mongo mỗi lần tính trạng thái. `undefined` (snapshot cũ trước p0-03 hoặc mock test) coi như `true`. */
  showPresence?: boolean;
}

const CACHE_TTL_SECONDS = 60;

function cacheKey(userId: string): string {
  return `user:status:${userId}`;
}

/**
 * Trạng thái tài khoản (status + sessionVersion) dùng để kiểm mỗi request
 * trong `authenticateToken`, cache Redis 60 giây để không query DB mỗi request.
 * Trả `null` khi user không còn tồn tại.
 */
export async function getUserStatusCached(userId: string): Promise<UserStatusSnapshot | null> {
  const key = cacheKey(userId);
  const cached = await redis.get<UserStatusSnapshot>(key);
  if (cached) return cached;

  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, sessionVersion: true, privacy: { select: { showPresence: true } } },
  });
  if (!record) return null;

  const snapshot: UserStatusSnapshot = {
    status: record.status,
    sessionVersion: record.sessionVersion,
    showPresence: record.privacy?.showPresence ?? true,
  };
  await redis.set(key, snapshot, CACHE_TTL_SECONDS);
  return snapshot;
}

/** Xoá cache — gọi sau khi khoá/mở/đổi role/thu hồi session để có hiệu lực ngay. */
export async function invalidateUserStatusCache(userId: string): Promise<void> {
  await redis.del(cacheKey(userId));
}
