import { redis } from "../../infrastructure/redis";
import { logger } from "../../infrastructure/logger";
import { isPermissionKey, type AdminResource, type PermissionKey } from "../constants/permissions";

/**
 * Quyền THEO DỮ LIỆU (p0-01 §2, D-05) — `partner:*` (chủ `PrintShop` APPROVED, p6-05), sau này `recruiter:*` (p6-08).
 * Khác `ROLE_PERMISSIONS` (theo vai hệ thống): quyền này suy từ dữ liệu nghiệp vụ nên do MODULE sở hữu dữ liệu đăng ký
 * provider (core không import module — cùng cơ chế `registerScopeResolver`).
 *
 * Nơi dùng:
 * - `requirePermission(key)`: khi vai hệ thống không có `key` và `key` thuộc tài nguyên có provider → tra ở đây (lười —
 *   route không cần quyền dữ liệu không tốn truy vấn nào).
 * - `AuthUserDto.permissions` (`/auth/me`, đăng nhập, refresh) — admin suy "vai đăng nhập" (`partner`/`recruiter`) từ đây.
 *
 * Cache Redis `perm:data:<userId>` 60 s. Đổi dữ liệu gốc (duyệt/tạm ngưng tiệm) → `invalidateDataPermissions(owner)` để
 * có hiệu lực ngay (KHÔNG tăng `sessionVersion` — không đá phiên). Provider lỗi → bỏ quyền của provider đó (fail-closed) + log.
 */
export interface DataPermissionProvider {
  /** Tên duy nhất (vd `print-shop`) — đăng ký lại cùng tên sẽ ghi đè (idempotent khi import nhiều lần). */
  name: string;
  /** Tài nguyên quyền mà provider có thể cấp — `requirePermission` chỉ tra provider khi khoá thuộc các tài nguyên này. */
  resources: readonly AdminResource[];
  forUser(userId: string): Promise<PermissionKey[]>;
}

const CACHE_TTL_SECONDS = 60;
const providers = new Map<string, DataPermissionProvider>();

const cacheKey = (userId: string): string => `perm:data:${userId}`;

export function registerDataPermissionProvider(provider: DataPermissionProvider): void {
  providers.set(provider.name, provider);
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearDataPermissionProviders(): void {
  providers.clear();
}

/** `true` khi có provider có thể cấp `key` (tài nguyên của khoá nằm trong `resources` của provider). */
export function hasDataPermissionProviderFor(key: PermissionKey): boolean {
  const resource = key.split(":")[0];
  for (const p of providers.values()) {
    if ((p.resources as readonly string[]).includes(resource)) return true;
  }
  return false;
}

async function computeDataPermissions(userId: string): Promise<PermissionKey[]> {
  const all = await Promise.all(
    [...providers.values()].map(async (p) => {
      try {
        const keys = await p.forUser(userId);
        return keys.filter((k) => isPermissionKey(k) && (p.resources as readonly string[]).includes(k.split(":")[0]));
      } catch (err) {
        logger.warn("[data-permissions] Provider lỗi — bỏ quyền của provider này", {
          provider: p.name,
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
    })
  );
  return [...new Set(all.flat())];
}

/** Quyền theo dữ liệu của `userId` (đã hợp nhất mọi provider, cache 60 s). Không có provider → `[]` (không truy vấn). */
export async function resolveDataPermissions(userId: string): Promise<PermissionKey[]> {
  if (providers.size === 0) return [];
  try {
    const cached = await redis.get<PermissionKey[]>(cacheKey(userId));
    if (Array.isArray(cached)) return cached;
  } catch {
    // Redis lỗi → tính trực tiếp (giống permission cache p0-02).
  }
  const keys = await computeDataPermissions(userId);
  try {
    await redis.set(cacheKey(userId), keys, CACHE_TTL_SECONDS);
  } catch {
    // Bỏ qua — lần sau tính lại.
  }
  return keys;
}

/** Xoá cache quyền theo dữ liệu — gọi SAU khi dữ liệu gốc đổi (duyệt/tạm ngưng tiệm, đổi chủ tiệm). */
export async function invalidateDataPermissions(userId: string): Promise<void> {
  try {
    await redis.del(cacheKey(userId));
  } catch (err) {
    logger.warn("[data-permissions] Không xoá được cache", { userId, error: err instanceof Error ? err.message : String(err) });
  }
}

/** Hợp nhất quyền đã có (vai hệ thống) với quyền theo dữ liệu — dùng khi dựng `AuthUserDto`. */
export async function withDataPermissions(userId: string, base: readonly string[]): Promise<string[]> {
  const extra = await resolveDataPermissions(userId);
  return extra.length === 0 ? [...base] : [...new Set([...base, ...extra])];
}
