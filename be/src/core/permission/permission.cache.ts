import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "node:async_hooks";
// `redis`/`logger` là singleton hạ tầng nền tảng, đã có tiền lệ import trực
// tiếp từ core (xem `core/permission/user-status.ts`, `core/utils/nonce.ts`,
// `core/utils/jwt.ts`) — khác với Socket.IO/BullMQ (cần DI qua `ports.ts`) vì
// 2 client này không có state khởi tạo phức tạp/circular với app bootstrap.
import { redis } from "../../infrastructure/redis";
import { logger } from "../../infrastructure/logger";
import {
  permissionResolveTotal,
  permissionResolveDuration,
  permissionBumpFailedTotal,
} from "../../infrastructure/metrics";
import { LIMITS } from "../constants/limits";
import { PermissionResolverError } from "../exceptions";
import type { AuthUser } from "../types/express";
import type { ScopeRef, ScopeType, ResolvedAccess, ResolveContext, ScopeResolver } from "./scope.types";
import type { Action } from "./actions";
import { getResolver } from "./scope-registry";
import { getPermissionPorts } from "./ports";

// ─────────────────────────────────────────────────────────────────────────────
// Key builders
// ─────────────────────────────────────────────────────────────────────────────

const BUMP_TTL_SECONDS = 30 * 24 * 3600; // 30 ngày (be.md §5.3), gia hạn mỗi lần INCR

function permverKey(scope: ScopeRef): string {
  return `permver:${scope.type}:${scope.id}`;
}

function permDepsKey(scope: ScopeRef): string {
  return `permdeps:${scope.type}:${scope.id}`;
}

function permKey(userId: string, scope: ScopeRef, version: string): string {
  return `perm:${userId}:${scope.type}:${scope.id}:v${version}`;
}

function scopeCacheKey(scope: ScopeRef): string {
  return `${scope.type}:${scope.id}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Version (be.md §5.3)
// ─────────────────────────────────────────────────────────────────────────────

async function getVersion(scope: ScopeRef): Promise<number> {
  try {
    const raw = await redis.get<number | string>(permverKey(scope));
    const n = typeof raw === "string" ? Number(raw) : raw;
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  } catch (err) {
    logger.warn("[permission] Lỗi đọc permver, dùng version 0", {
      scope,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/** INCR + EXPIRE thô — dùng bởi `bumpVersion()` và job retry `permission.bump`. Trả `null` nếu Redis không khả dụng. */
export async function incrVersion(scope: ScopeRef): Promise<number | null> {
  const next = await redis.incr(permverKey(scope));
  if (next === null) return null;
  await redis.expire(permverKey(scope), BUMP_TTL_SECONDS);
  return next;
}

/**
 * Tăng version của 1 scope — mọi khoá cache `perm:*:v{cũ}` tự vô hiệu (không
 * cần xoá theo pattern). Gọi SAU KHI transaction ghi membership/grant đã
 * commit. Nếu Redis lỗi: KHÔNG throw (revokeScope vẫn phải tiếp tục
 * leaveRooms/emit — quyền cũ tối đa còn hiệu lực `cacheTtlSeconds`, xem
 * README "Rủi ro") — thay vào đó log + metric + xếp job retry qua
 * `OutboxPort`, trả `-1` làm sentinel "không biết version mới".
 */
export async function bumpVersion(scope: ScopeRef): Promise<number> {
  const next = await incrVersion(scope);
  if (next !== null) return next;

  logger.warn("[permission] bumpVersion thất bại (Redis không khả dụng)", scope);
  permissionBumpFailedTotal.inc({ type: scope.type });
  try {
    await getPermissionPorts().outbox.enqueueNow("permission.bump", {
      scopeType: scope.type,
      scopeId: scope.id,
      eventId: randomUUID(),
    });
  } catch (err) {
    logger.warn("[permission] Không thể xếp job retry permission.bump", {
      scope,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// versionDeps — bump 1 scope cha vô hiệu cache của mọi scope con phụ thuộc
// (be.md §5.1 bước 2) mà KHÔNG cần INCR từng scope con. `permdeps:{type}:{id}`
// ghi nhớ deps do lần resolve gần nhất phát hiện, TTL bằng cacheTtlSeconds nên
// tự làm mới — không cần cơ chế bất hoạt riêng.
// ─────────────────────────────────────────────────────────────────────────────

async function getKnownDeps(scope: ScopeRef): Promise<ScopeRef[]> {
  try {
    const raw = await redis.get<ScopeRef[]>(permDepsKey(scope));
    return raw ?? [];
  } catch {
    return [];
  }
}

async function setKnownDeps(scope: ScopeRef, deps: ScopeRef[]): Promise<void> {
  if (deps.length === 0) return;
  try {
    await redis.set(permDepsKey(scope), deps, LIMITS.permission.cacheTtlSeconds);
  } catch {
    // best-effort — cache chính vẫn đúng, chỉ mất tối ưu "bump cha invalidate con"
  }
}

async function composedVersion(scope: ScopeRef, deps: ScopeRef[]): Promise<string> {
  const versions = await Promise.all([scope, ...deps].map((s) => getVersion(s)));
  return versions.join(".");
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache read/write — fail-open (Redis lỗi → bỏ qua cache, KHÔNG chặn request)
// ─────────────────────────────────────────────────────────────────────────────

interface CachedAccess {
  visible: boolean;
  role: string | null;
  actions: string[];
  parent?: ScopeRef;
  /** ISO — xem `ResolvedAccess.expiresAt` (p3-04). */
  expiresAt?: string;
}

function toCached(access: ResolvedAccess): CachedAccess {
  return {
    visible: access.visible,
    role: access.role,
    actions: [...access.actions],
    parent: access.parent,
    ...(access.expiresAt && { expiresAt: access.expiresAt.toISOString() }),
  };
}

function fromCached(cached: CachedAccess): ResolvedAccess {
  // Khách hết hạn giữa lúc ghi cache và lúc đọc → không thấy ngay (be.md p3-04 §5.1 "không chờ job").
  if (cached.expiresAt && new Date(cached.expiresAt).getTime() <= Date.now()) {
    return { visible: false, role: null, actions: new Set<Action>() };
  }
  return {
    visible: cached.visible,
    role: cached.role,
    actions: new Set(cached.actions) as ReadonlySet<Action>,
    parent: cached.parent,
    ...(cached.expiresAt && { expiresAt: new Date(cached.expiresAt) }),
  };
}

async function safeGetCache(key: string): Promise<ResolvedAccess | null> {
  try {
    const cached = await redis.get<CachedAccess>(key);
    return cached ? fromCached(cached) : null;
  } catch (err) {
    logger.warn("[permission] Lỗi đọc cache, bỏ qua cache cho lần này", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function safeSetCache(key: string, access: ResolvedAccess): Promise<void> {
  try {
    await redis.set(key, toCached(access), LIMITS.permission.cacheTtlSeconds);
  } catch (err) {
    logger.warn("[permission] Lỗi ghi cache, bỏ qua", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dedupe lời gọi đồng thời cùng key trong 1 "phiên" (thường là 1 request HTTP)
// qua AsyncLocalStorage — be.md §5.1 bước 6.
// ─────────────────────────────────────────────────────────────────────────────

const als = new AsyncLocalStorage<Map<string, Promise<ResolvedAccess>>>();

/**
 * Chạy `fn` trong 1 phiên dedupe mới — lồng nhau (gọi lại bên trong 1 phiên
 * đã có, vd resolver con gọi `ctx.resolve(parent)`) dùng CHUNG map hiện tại
 * thay vì tạo phiên mới, để dedupe hoạt động xuyên suốt cây gọi đệ quy của 1
 * lần `resolve()`/`resolveMany()` cấp cao nhất.
 */
function withPermissionScope<T>(fn: () => Promise<T>): Promise<T> {
  if (als.getStore()) return fn();
  return als.run(new Map(), fn);
}

function dedupe(key: string, compute: () => Promise<ResolvedAccess>): Promise<ResolvedAccess> {
  const store = als.getStore();
  if (!store) return compute(); // ngoài phiên (job, script, test gọi thẳng) → không dedupe
  const existing = store.get(key);
  if (existing) return existing;
  const promise = compute().finally(() => store.delete(key));
  store.set(key, promise);
  return promise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gọi resolver với timeout — resolver lỗi/timeout → fail-closed (503), KHÔNG
// bao giờ coi "không biết" là "được phép".
// ─────────────────────────────────────────────────────────────────────────────

async function callResolver(
  resolver: ScopeResolver,
  user: AuthUser,
  scope: ScopeRef,
  ctx: ResolveContext
): Promise<ResolvedAccess> {
  const timeoutMs = LIMITS.permission.resolverTimeoutMs;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      resolver.resolve(user, scope.id, ctx),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Resolver timeout sau ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (err) {
    logger.error("[permission] Resolver lỗi hoặc timeout", {
      scopeType: scope.type,
      scopeId: scope.id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new PermissionResolverError();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function makeContext(): ResolveContext {
  return {
    now: new Date(),
    resolve: (u, s) => resolveWithCache(u, s),
  };
}

function requireResolver(type: ScopeType): ScopeResolver {
  const resolver = getResolver(type);
  if (!resolver) {
    // Lỗi lập trình (module quên đăng ký resolver trước khi route dùng nó) —
    // KHÔNG phải AppError nghiệp vụ, propagate nguyên vẹn để errorHandler map
    // thành SYS_500 và test bắt được ngay (be.md §5.1 bước 1).
    throw new Error(`[permission] Chưa đăng ký resolver cho scope "${type}"`);
  }
  return resolver;
}

// ─────────────────────────────────────────────────────────────────────────────
// resolve có cache (be.md §5.1)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveUncached(user: AuthUser, scope: ScopeRef): Promise<ResolvedAccess> {
  const resolver = requireResolver(scope.type);
  const startedAt = process.hrtime.bigint();
  const observe = () => {
    const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    permissionResolveDuration.observe({ type: scope.type }, seconds);
  };

  const deps = await getKnownDeps(scope);
  const version = await composedVersion(scope, deps);
  const key = permKey(user.id, scope, version);

  const cached = await safeGetCache(key);
  if (cached) {
    permissionResolveTotal.inc({ type: scope.type, cache: "hit" });
    observe();
    return cached;
  }

  permissionResolveTotal.inc({ type: scope.type, cache: "miss" });
  const access = await callResolver(resolver, user, scope, makeContext());

  if (access.versionDeps && access.versionDeps.length > 0) {
    await setKnownDeps(scope, access.versionDeps);
    const v2 = await composedVersion(scope, access.versionDeps);
    await safeSetCache(permKey(user.id, scope, v2), access);
  } else {
    await safeSetCache(key, access);
  }

  observe();
  return access;
}

/** Điểm vào chính — `PermissionService.resolve()`/`can()`/`assert()` đều đi qua đây. */
export function resolveWithCache(user: AuthUser, scope: ScopeRef): Promise<ResolvedAccess> {
  return withPermissionScope(() => dedupe(`${user.id}:${scopeCacheKey(scope)}`, () => resolveUncached(user, scope)));
}

/**
 * Batch cho 1 danh sách id cùng loại scope — kiểm cache từng id trước, chỉ
 * gọi resolver (ưu tiên `resolveMany` của resolver nếu có) cho phần cache
 * miss, tránh N truy vấn DB khi phần lớn đã có cache (README "Rủi ro").
 */
export function resolveManyWithCache(
  user: AuthUser,
  type: ScopeType,
  ids: string[]
): Promise<Map<string, ResolvedAccess>> {
  return withPermissionScope(async () => {
    const resolver = requireResolver(type);
    const result = new Map<string, ResolvedAccess>();
    const missIds: string[] = [];
    const ownVersionByCacheId = new Map<string, string>();

    for (const id of ids) {
      const scope: ScopeRef = { type, id };
      const deps = await getKnownDeps(scope);
      const version = await composedVersion(scope, deps);
      ownVersionByCacheId.set(id, version);
      const cached = await safeGetCache(permKey(user.id, scope, version));
      if (cached) {
        permissionResolveTotal.inc({ type, cache: "hit" });
        result.set(id, cached);
      } else {
        missIds.push(id);
      }
    }

    if (missIds.length === 0) return result;
    permissionResolveTotal.inc({ type, cache: "miss" }, missIds.length);

    const ctx = makeContext();
    let resolved: Map<string, ResolvedAccess>;
    if (resolver.resolveMany) {
      try {
        resolved = await resolver.resolveMany(user, missIds, ctx);
      } catch (err) {
        logger.error("[permission] resolveMany lỗi", {
          type,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new PermissionResolverError();
      }
    } else {
      const entries = await Promise.all(
        missIds.map(async (id) => [id, await callResolver(resolver, user, { type, id }, ctx)] as const)
      );
      resolved = new Map(entries);
    }

    for (const [id, access] of resolved) {
      result.set(id, access);
      const scope: ScopeRef = { type, id };
      if (access.versionDeps && access.versionDeps.length > 0) {
        await setKnownDeps(scope, access.versionDeps);
        const v2 = await composedVersion(scope, access.versionDeps);
        await safeSetCache(permKey(user.id, scope, v2), access);
      } else {
        await safeSetCache(permKey(user.id, scope, ownVersionByCacheId.get(id) ?? "0"), access);
      }
    }

    return result;
  });
}
