/**
 * @file runtime-config.ts
 * @description `RuntimeConfigService` (p0-07 be.md §5.2) — hợp nhất
 * `LIMITS`/`FEATURE_FLAGS` (mã + env) với override runtime lưu trong
 * `SystemConfig`, cache 2 tầng (bộ nhớ tiến trình TTL `SYSTEM_CONFIG_CACHE_MS`
 * + Redis `cfg:<key>` không TTL) đồng bộ đa instance qua kênh Pub/Sub
 * `cfg:invalidate`.
 *
 * `redis`/`logger` import trực tiếp — tiền lệ đã có ở `core/permission/user-status.ts`,
 * `core/utils/jwt.ts` (singleton hạ tầng nền tảng, không phải module nghiệp
 * vụ). Riêng việc ĐỌC `SystemConfig` từ Mongo đi qua cổng `ISystemConfigReader`
 * (giống `core/permission/ports.ts`) — module `system-config` cài đặt bằng
 * `PrismaSystemConfigRepository` rồi gọi `initRuntimeConfig()` MỘT LẦN lúc
 * khởi động (`server.ts`/`worker.ts`), core KHÔNG import module đó trực tiếp.
 */
import { createHash } from "crypto";
import { redis } from "../../infrastructure/redis";
import { logger } from "../../infrastructure/logger";
import { env } from "./env.schema";
import { LIMITS, type Limits } from "../constants/limits";
import {
  AVAILABLE_MODULES,
  AI_BLOCKED,
  FEATURE_FLAGS,
  SUB_FEATURE_PARENT,
  subFeatureDefault,
  type ModuleId,
  type SubFeatureId,
} from "../constants/modules";
import { SYSTEM_CONFIG_REGISTRY, type ConfigField, type ConfigKeyDef } from "./system-config.registry";

export interface SystemConfigSnapshot {
  /** Chỉ phần override (partial) — KHÔNG phải bản hợp nhất với default. */
  value: Record<string, unknown>;
  version: number;
}

/** Cổng đọc `SystemConfig` — cài đặt thật là `PrismaSystemConfigRepository` (modules/system-config). */
export interface ISystemConfigReader {
  findByKey(key: string): Promise<SystemConfigSnapshot | null>;
}

let reader: ISystemConfigReader | null = null;

/** Gọi đúng 1 lần lúc khởi động (`server.ts`/`worker.ts`), giống `setPermissionPorts()`. */
export function initRuntimeConfig(r: ISystemConfigReader): void {
  reader = r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache bộ nhớ tiến trình (tầng 1) + Redis `cfg:<key>` (tầng 2, không TTL)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = "cfg:";
const INVALIDATE_CHANNEL = `${env.REDIS_KEY_PREFIX}cfg:invalidate`;

interface MemEntry {
  snapshot: SystemConfigSnapshot;
  expiresAt: number;
}
const memCache = new Map<string, MemEntry>();

function memGet(key: string): SystemConfigSnapshot | undefined {
  const entry = memCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memCache.delete(key);
    return undefined;
  }
  return entry.snapshot;
}

function memSet(key: string, snapshot: SystemConfigSnapshot): void {
  memCache.set(key, { snapshot, expiresAt: Date.now() + env.SYSTEM_CONFIG_CACHE_MS });
}

function invalidateLocal(key: string): void {
  memCache.delete(key);
}

const EMPTY_SNAPSHOT: SystemConfigSnapshot = { value: {}, version: 0 };

/** Đọc snapshot (override thô + version) — bộ nhớ → Redis → Mongo (`reader`), fail-open về mặc định khi lỗi. */
async function fetchSnapshot(key: string): Promise<SystemConfigSnapshot> {
  const mem = memGet(key);
  if (mem) return mem;

  try {
    const cached = await redis.get<SystemConfigSnapshot>(CACHE_PREFIX + key);
    if (cached) {
      memSet(key, cached);
      return cached;
    }
  } catch (err) {
    logger.warn("[runtime-config] Lỗi đọc cache Redis, thử Mongo trực tiếp", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  let stored: SystemConfigSnapshot | null = null;
  if (reader) {
    try {
      stored = await reader.findByKey(key);
    } catch (err) {
      logger.warn("[runtime-config] Lỗi đọc SystemConfig, dùng mặc định", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const snapshot = stored ?? EMPTY_SNAPSHOT;

  try {
    await redis.set(CACHE_PREFIX + key, snapshot);
  } catch {
    // best-effort — cache bộ nhớ (dòng dưới) vẫn đúng cho request hiện tại
  }
  memSet(key, snapshot);
  return snapshot;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dot-path get/set — field.path hỗ trợ tối đa vài cấp lồng (vd "appLock.enabled")
// ─────────────────────────────────────────────────────────────────────────────

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, seg) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[seg] : undefined),
      obj
    );
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split(".");
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const seg = segs[i]!;
    const next = cur[seg];
    if (typeof next !== "object" || next === null) cur[seg] = {};
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
}

function resolveCeil(field: ConfigField): number | undefined {
  return typeof field.ceil === "function" ? field.ceil() : field.ceil;
}

/**
 * Merge `default ⊕ stored` rồi CLAMP theo `floor`/`ceil` (phòng env giảm trần
 * sau khi đã lưu, be.md §5.2) — clamp ÂM THẦM ở đây, khác `SystemConfigService`
 * (từ chối ghi khi vượt trần, be.md §5.1 bước 3).
 */
function buildEffective(def: ConfigKeyDef, stored: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const field of def.fields) {
    const overridden = getPath(stored, field.path);
    const raw = overridden !== undefined ? overridden : field.default;
    let value: unknown = raw;
    if ((field.kind === "int" || field.kind === "bytes") && typeof raw === "number") {
      let num = raw;
      const floor = field.floor;
      const ceil = resolveCeil(field);
      if (typeof floor === "number" && num < floor) num = floor;
      if (typeof ceil === "number" && num > ceil) num = ceil;
      value = num;
    }
    setPath(merged, field.path, value);
  }
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// API công khai
// ─────────────────────────────────────────────────────────────────────────────

/** Giá trị hiệu lực (default registry ⊕ override đã clamp) cho 1 khoá — `{}` nếu khoá không tồn tại trong registry. */
export async function getEffective(key: string): Promise<Record<string, unknown>> {
  const def = SYSTEM_CONFIG_REGISTRY[key];
  if (!def) return {};
  const snapshot = await fetchSnapshot(key);
  return buildEffective(def, snapshot.value);
}

/** Đọc 1 giá trị theo path `"<registryKey>.<subPath...>"` (vd `"auth.biometricLogin.enabled"`) — dùng bởi `requireSystemConfig`. */
export async function get(path: string): Promise<unknown> {
  const [key, ...rest] = path.split(".");
  if (!key) return undefined;
  const effective = await getEffective(key);
  return rest.length === 0 ? effective : getPath(effective, rest.join("."));
}

/** `LIMITS` với mọi nhóm `limits.*` đã đăng ký trong registry ghi đè bằng override hiệu lực (đã clamp). */
export async function getLimits(): Promise<Limits> {
  const result = structuredClone(LIMITS) as Record<string, unknown>;
  const groupKeys = Object.keys(SYSTEM_CONFIG_REGISTRY).filter((k) => k.startsWith("limits."));
  await Promise.all(
    groupKeys.map(async (key) => {
      const groupName = key.slice("limits.".length);
      const effective = await getEffective(key);
      result[groupName] = { ...(result[groupName] as Record<string, unknown>), ...effective };
    })
  );
  return result as unknown as Limits;
}

/** `(stored.features[m] ?? FEATURE_FLAGS[m]) && AVAILABLE_MODULES.includes(m) && !AI_BLOCKED.has(m)` (be.md §5.2). */
export async function isFeatureEnabled(m: ModuleId): Promise<boolean> {
  if (AI_BLOCKED.has(m)) return false;
  if (!AVAILABLE_MODULES.includes(m)) return false;
  const snapshot = await fetchSnapshot("features");
  const overridden = snapshot.value[m];
  return typeof overridden === "boolean" ? overridden : FEATURE_FLAGS[m];
}

/**
 * Cờ phụ của tiện ích (p5-04): `(stored.features[id] ?? subFeatureDefault(id)) && isFeatureEnabled(SUB_FEATURE_PARENT[id])` — phân hệ cha tắt thì cờ phụ tắt theo,
 * cờ phụ chưa từng cấu hình mặc định BẬT (trừ `SUB_FEATURE_DEFAULT_OFF`, vd `gif` của p7-04 — chưa có nhà cung cấp).
 */
export async function isSubFeatureEnabled(id: SubFeatureId): Promise<boolean> {
  if (!(await isFeatureEnabled(SUB_FEATURE_PARENT[id]))) return false;
  const snapshot = await fetchSnapshot("features");
  const overridden = snapshot.value[id];
  return typeof overridden === "boolean" ? overridden : subFeatureDefault(id);
}

/** sha1 của các cặp `key:version` (mọi khoá registry) đã sort — dùng làm ETag `capabilities` (be.md §5.2). */
export async function configVersion(): Promise<string> {
  const keys = Object.keys(SYSTEM_CONFIG_REGISTRY).sort();
  const parts = await Promise.all(keys.map(async (k) => `${k}:${(await fetchSnapshot(k)).version}`));
  return createHash("sha1").update(parts.join(",")).digest("hex");
}

/**
 * Gọi SAU KHI transaction ghi `SystemConfig` đã commit — SET Redis với giá
 * trị mới (đọc lại ngay không cần chờ Mongo) + xoá cache bộ nhớ CỦA CHÍNH
 * instance này + PUBLISH cho các instance khác. Lỗi Redis chỉ log warn (TTL
 * bộ nhớ `SYSTEM_CONFIG_CACHE_MS` tự hết) — KHÔNG làm hỏng request đã commit rồi.
 */
export async function publishInvalidate(key: string, fresh: SystemConfigSnapshot | null = null): Promise<void> {
  try {
    if (fresh) await redis.set(CACHE_PREFIX + key, fresh);
    else await redis.del(CACHE_PREFIX + key);
  } catch (err) {
    logger.warn("[runtime-config] Lỗi ghi cache Redis sau khi cập nhật", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  invalidateLocal(key);
  try {
    const client = redis.getClient();
    if (client?.isReady) await client.publish(INVALIDATE_CHANNEL, key);
  } catch (err) {
    logger.warn("[runtime-config] Publish cfg:invalidate thất bại — instance khác chờ TTL cache", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Đồng bộ đa instance — subscriber Redis riêng (node-redis `duplicate()`)
// ─────────────────────────────────────────────────────────────────────────────

type RedisLike = NonNullable<ReturnType<typeof redis.getClient>>;
let subscriber: RedisLike | null = null;

/** Chặn trần thời gian chờ subscriber connect — `sub.connect()` mặc định tự
 * retry vô hạn (giống `redis.client.ts#connect()`), không bao giờ reject khi
 * Redis down, treo `startServer()` mãi mãi nếu chỉ `try/catch`. */
const SUBSCRIBER_CONNECT_TIMEOUT_MS = 5000;

/**
 * Đăng ký lắng kênh `cfg:invalidate` — gọi 1 lần lúc khởi động SAU
 * `redis.connect()` (giống `startOutboxRelay()`). Redis chưa kết nối được
 * (dev không có Redis) → bỏ qua êm, instance vẫn đúng nhờ TTL bộ nhớ.
 */
export async function startRuntimeConfigSync(): Promise<void> {
  if (subscriber) return;
  const base = redis.getClient();
  if (!base?.isReady) return;
  try {
    const sub = base.duplicate();
    sub.on("error", (err: Error) => logger.warn("[runtime-config] subscriber Redis lỗi", { error: err.message }));
    await Promise.race([
      sub.connect(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`Subscriber connect quá ${SUBSCRIBER_CONNECT_TIMEOUT_MS}ms`)),
          SUBSCRIBER_CONNECT_TIMEOUT_MS
        ).unref();
      }),
    ]);
    await sub.subscribe(INVALIDATE_CHANNEL, (key: string) => invalidateLocal(key));
    subscriber = sub;
    logger.info("[runtime-config] Đã đăng ký kênh cfg:invalidate");
  } catch (err) {
    logger.warn("[runtime-config] Không thể subscribe cfg:invalidate — chỉ dựa vào TTL cache bộ nhớ", {
      error: err instanceof Error ? err.message : String(err),
    });
    subscriber = null;
  }
}

/** Dừng sạch subscriber — gọi trong graceful shutdown. */
export async function stopRuntimeConfigSync(): Promise<void> {
  if (subscriber) {
    await subscriber.quit().catch(() => undefined);
    subscriber = null;
  }
}

/** Chỉ dùng trong test để cô lập giữa các case (reset reader + cache bộ nhớ). */
export function resetRuntimeConfig(): void {
  reader = null;
  memCache.clear();
}

export const runtimeConfig = {
  getEffective,
  get,
  getLimits,
  isFeatureEnabled,
  isSubFeatureEnabled,
  configVersion,
  publishInvalidate,
};
