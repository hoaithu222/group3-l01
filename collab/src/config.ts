import os from "node:os";
import { z } from "zod";
import { ALL_KINDS, type ResourceKind } from "./resource-kinds";

/** Chuỗi rỗng trong `.env` (`KEY=`) coi như chưa đặt. */
const blankToUndefined = (v: unknown): unknown => (typeof v === "string" && v.trim() === "" ? undefined : v);

const intEnv = (def: number, min: number, max = Number.MAX_SAFE_INTEGER) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).default(def));

const boolEnv = (def: boolean) =>
  z.preprocess(
    blankToUndefined,
    z
      .enum(["true", "false", "1", "0"])
      .default(def ? "true" : "false")
      .transform((v) => v === "true" || v === "1"),
  );

const optionalString = z.preprocess(blankToUndefined, z.string().optional());

const MiB = 1024 * 1024;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: intEnv(4000, 0, 65535),
  HOST: z.preprocess(blankToUndefined, z.string().default("0.0.0.0")),
  /** Gốc URL của BE cho lời gọi nội bộ (`<BE_INTERNAL_URL>/api/internal/...`), vd `http://api:3000`. */
  BE_INTERNAL_URL: z.string().url(),
  /** Bí mật dùng chung với BE: ký/kiểm collab token + header `X-Collab-Secret` hai chiều. */
  COLLAB_SHARED_SECRET: z.string().min(32, "COLLAB_SHARED_SECRET phải ≥ 32 ký tự"),
  /** Có → bật Redis extension (nhiều instance). Không → chạy một instance. */
  REDIS_URL: optionalString,
  REDIS_KEY_PREFIX: z.preprocess(blankToUndefined, z.string().default("superapp:collab:")),
  /** Danh sách loại tài nguyên phục vụ (phân tách dấu phẩy): `document` mặc định; p6-02 thêm `whiteboard`. */
  COLLAB_KINDS: z.preprocess(blankToUndefined, z.string().default("document")),

  // ── Lưu trạng thái (BE là nguồn duy nhất) ──
  STORE_DEBOUNCE_MS: intEnv(2000, 0),
  STORE_MAX_DEBOUNCE_MS: intEnv(60_000, 100),
  STORE_RETRY_BASE_MS: intEnv(2000, 10),
  STORE_RETRY_MAX_MS: intEnv(60_000, 50),
  /** Số document tối đa được giữ trong RAM chỉ vì chưa lưu được về BE (BE sập lâu) — quá thì bỏ cũ nhất + log lỗi. */
  PENDING_MAX_DOCS: intEnv(500, 1),
  BE_TIMEOUT_MS: intEnv(5000, 100),
  BE_RETRIES: intEnv(2, 0, 5),

  // ── Giới hạn kết nối ──
  MAX_CONNECTIONS_PER_DOC: intEnv(50, 1),
  MAX_CONNECTIONS_PER_USER_PER_DOC: intEnv(10, 1),
  MAX_CONNECTIONS_PER_IP: intEnv(1000, 1),
  /** Trần một khung WebSocket (byte). Mặc định 6 MiB > `stateMaxBytes` 5 MiB của tài liệu. */
  WS_MAX_PAYLOAD_BYTES: intEnv(6 * MiB, 1024),
  /** Trần số message Yjs/awareness mỗi kết nối mỗi giây (chống flood). */
  MAX_MESSAGES_PER_SECOND: intEnv(200, 1),
  /**
   * Trần tần suất awareness (con trỏ/bản nháp kéo) của BẢNG TRẮNG, tính theo kết nối (lần/giây). Client tự throttle ≤ 30 Hz nên 60 là dư gấp đôi
   * cho jitter mạng; quá mức này server BỎ bớt (không đóng kết nối) vì awareness chỉ là trạng thái tạm, tin sau sẽ thay tin bị bỏ.
   */
  WB_AWARENESS_MAX_HZ: intEnv(60, 1),
  /** Socket chưa xác thực xong sau ngần này ms bị đóng. */
  AUTH_TIMEOUT_MS: intEnv(10_000, 100),
  /** Chu kỳ ping/pong của Hocuspocus. */
  WS_PING_TIMEOUT_MS: intEnv(30_000, 1000),
  /** Số lần xác thực thất bại/IP/phút trước khi từ chối nâng cấp WebSocket (429). */
  MAX_FAILED_AUTH_PER_IP_PER_MINUTE: intEnv(30, 1),

  // ── Quyền ──
  /** Bộ nhớ đệm kết quả `GET /internal/.../access` (giây thu hồi quyền tối đa ≈ giá trị này). */
  ACCESS_CACHE_TTL_MS: intEnv(30_000, 0),
  /** Chu kỳ kiểm lại quyền của mọi kết nối đang mở (0 = tắt). */
  ACCESS_RECHECK_MS: intEnv(30_000, 0),

  SHUTDOWN_GRACE_MS: intEnv(25_000, 0),
  /** `true` khi sau reverse proxy (nginx): lấy IP từ `X-Forwarded-For`. */
  TRUST_PROXY: boolEnv(false),
  /** Có → `GET /metrics` yêu cầu `Authorization: Bearer <token>`. */
  METRICS_TOKEN: optionalString,
  LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(["debug", "info", "warn", "error"]).default("info")),
  SENTRY_DSN: optionalString,
  APP_VERSION: z.preprocess(blankToUndefined, z.string().default("0.1.0")),
  INSTANCE_ID: optionalString,
});

export interface CollabConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  beInternalUrl: string;
  sharedSecret: string;
  redisUrl: string | undefined;
  redisKeyPrefix: string;
  kinds: ReadonlySet<ResourceKind>;
  storeDebounceMs: number;
  storeMaxDebounceMs: number;
  storeRetryBaseMs: number;
  storeRetryMaxMs: number;
  pendingMaxDocs: number;
  beTimeoutMs: number;
  beRetries: number;
  maxConnectionsPerDoc: number;
  maxConnectionsPerUserPerDoc: number;
  maxConnectionsPerIp: number;
  wsMaxPayloadBytes: number;
  maxMessagesPerSecond: number;
  wbAwarenessMaxHz: number;
  authTimeoutMs: number;
  wsPingTimeoutMs: number;
  maxFailedAuthPerIpPerMinute: number;
  accessCacheTtlMs: number;
  accessRecheckMs: number;
  shutdownGraceMs: number;
  trustProxy: boolean;
  metricsToken: string | undefined;
  logLevel: "debug" | "info" | "warn" | "error";
  sentryDsn: string | undefined;
  appVersion: string;
  instanceId: string;
}

export class ConfigError extends Error {}

/** Đọc + kiểm biến môi trường. Lỗi chỉ nêu TÊN khoá và lý do, không in giá trị (tránh lộ bí mật). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): CollabConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join(".") || "(env)"}: ${i.message}`);
    throw new ConfigError(`Cấu hình collab không hợp lệ:\n${lines.join("\n")}`);
  }
  const e = parsed.data;

  const kinds = new Set<ResourceKind>();
  for (const raw of e.COLLAB_KINDS.split(",")) {
    const k = raw.trim();
    if (!k) continue;
    if (!(ALL_KINDS as readonly string[]).includes(k)) throw new ConfigError(`COLLAB_KINDS: loại lạ "${k}" (hợp lệ: ${ALL_KINDS.join(", ")})`);
    kinds.add(k as ResourceKind);
  }
  if (kinds.size === 0) throw new ConfigError("COLLAB_KINDS: cần ít nhất một loại");

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    beInternalUrl: e.BE_INTERNAL_URL.replace(/\/+$/, ""),
    sharedSecret: e.COLLAB_SHARED_SECRET,
    redisUrl: e.REDIS_URL,
    redisKeyPrefix: e.REDIS_KEY_PREFIX,
    kinds,
    storeDebounceMs: e.STORE_DEBOUNCE_MS,
    storeMaxDebounceMs: Math.max(e.STORE_MAX_DEBOUNCE_MS, e.STORE_DEBOUNCE_MS),
    storeRetryBaseMs: e.STORE_RETRY_BASE_MS,
    storeRetryMaxMs: Math.max(e.STORE_RETRY_MAX_MS, e.STORE_RETRY_BASE_MS),
    pendingMaxDocs: e.PENDING_MAX_DOCS,
    beTimeoutMs: e.BE_TIMEOUT_MS,
    beRetries: e.BE_RETRIES,
    maxConnectionsPerDoc: e.MAX_CONNECTIONS_PER_DOC,
    maxConnectionsPerUserPerDoc: e.MAX_CONNECTIONS_PER_USER_PER_DOC,
    maxConnectionsPerIp: e.MAX_CONNECTIONS_PER_IP,
    wsMaxPayloadBytes: e.WS_MAX_PAYLOAD_BYTES,
    maxMessagesPerSecond: e.MAX_MESSAGES_PER_SECOND,
    wbAwarenessMaxHz: e.WB_AWARENESS_MAX_HZ,
    authTimeoutMs: e.AUTH_TIMEOUT_MS,
    wsPingTimeoutMs: e.WS_PING_TIMEOUT_MS,
    maxFailedAuthPerIpPerMinute: e.MAX_FAILED_AUTH_PER_IP_PER_MINUTE,
    accessCacheTtlMs: e.ACCESS_CACHE_TTL_MS,
    accessRecheckMs: e.ACCESS_RECHECK_MS,
    shutdownGraceMs: e.SHUTDOWN_GRACE_MS,
    trustProxy: e.TRUST_PROXY,
    metricsToken: e.METRICS_TOKEN,
    logLevel: e.LOG_LEVEL,
    sentryDsn: e.SENTRY_DSN,
    appVersion: e.APP_VERSION,
    instanceId: e.INSTANCE_ID ?? `${os.hostname()}-${process.pid}`,
  };
}
