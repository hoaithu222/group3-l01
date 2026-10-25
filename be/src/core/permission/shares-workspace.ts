import { prisma } from "../../infrastructure/database";
import { redis } from "../../infrastructure/redis";
import { logger } from "../../infrastructure/logger";

const CACHE_TTL_SECONDS = 60;

function cacheKey(userIdA: string, userIdB: string): string {
  const [x, y] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
  return `shares:${x}:${y}`;
}

/**
 * be.md p1-05 §5.1 — "chung ≥ 1 workspace ACTIVE" (điều kiện nhắn DIRECT).
 * Đặt ở `core/permission` (không phải `modules/conversations`) — helper
 * cross-cutting cấp permission dùng chung, cùng vị trí với
 * `getUserStatusCached`/`buildMyPermissions` trong thư mục này (item 3 báo
 * cáo tác vụ p1-05). Cache Redis `shares:{a}:{b}` 60s (be.md's own note),
 * fail-open khi Redis lỗi — bỏ qua cache, tính trực tiếp từ
 * `WorkspaceMembership` (vẫn đúng, chỉ mất tối ưu, cùng triết lý
 * `permission.cache.ts#safeGetCache`).
 */
export async function sharesActiveWorkspace(userIdA: string, userIdB: string): Promise<boolean> {
  if (userIdA === userIdB) return true;
  const key = cacheKey(userIdA, userIdB);

  try {
    const cached = await redis.get<{ v: boolean }>(key);
    if (cached) return cached.v;
  } catch (err) {
    logger.warn("[permission] sharesActiveWorkspace: lỗi đọc cache, tính trực tiếp", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const rows = await prisma.workspaceMembership.findMany({
    where: { userId: { in: [userIdA, userIdB] }, status: "ACTIVE" },
    select: { userId: true, workspaceId: true },
  });
  const workspacesOfA = new Set(rows.filter((r) => r.userId === userIdA).map((r) => r.workspaceId));
  const shares = rows.some((r) => r.userId === userIdB && workspacesOfA.has(r.workspaceId));

  try {
    await redis.set(key, { v: shares }, CACHE_TTL_SECONDS);
  } catch {
    // best-effort — cache là tối ưu, không chặn nghiệp vụ
  }
  return shares;
}

/** Xoá cache khi membership 2 người đổi (rời/bị loại workspace) — be.md §9 "Rủi ro" ("xoá khi membership đổi (bumpVersion)"). */
export async function invalidateSharesActiveWorkspaceCache(userIdA: string, userIdB: string): Promise<void> {
  try {
    await redis.del(cacheKey(userIdA, userIdB));
  } catch {
    // best-effort
  }
}
