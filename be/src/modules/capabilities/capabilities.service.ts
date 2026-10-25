import { env } from "../../core/config";
import { runtimeConfig } from "../../core/config/runtime-config";
import {
  LIMITS,
  AVAILABLE_MODULES,
  AI_BLOCKED,
  MODULES,
  SUB_FEATURES,
  SUB_FEATURE_IDS,
  SUB_FEATURE_PARENT,
  SUB_FEATURE_UNAVAILABLE,
  type Limits,
  type ModuleId,
  type SubFeatureId,
} from "../../core/constants";
import { parseSize } from "../../core/utils/size";
import { isMeetingRecordingSupported } from "../../infrastructure/media";

export interface CapabilityFeature {
  enabled: boolean;
  available: boolean;
  /** Chỉ có ở module bị chặn cứng theo quyết định dự án (D-13) — `ai`/`ai-assistant`/`knowledge`. */
  blocked?: "D-13";
}

export interface Capabilities {
  version: string;
  /** sha1 các cặp `key:version` của mọi khoá `SystemConfig` (registry) — dùng làm `ETag`. */
  configVersion: string;
  /** Phân hệ + cờ phụ của tiện ích (p5-04: `workspaceSearch`, `workspaceTemplates`, `readConfirm`; p7-04: `polls`, `scheduledMessages`, `messageReminders`, `messageToTask`, `messageToResource`, `gif` — `available` = phân hệ cha có mã và tiện ích đã có mã). */
  features: Record<ModuleId | SubFeatureId, CapabilityFeature>;
  limits: Limits;
  upload: {
    maxFileBytes: number;
    allowedMime: readonly string[];
    /**
     * MIME BỔ SUNG riêng theo scope (`LIMITS.upload.scopeMime`, p3-01) — `allowedMime` chỉ gộp MIME của các kind nên client không biết scope
     * `RESOURCE` còn nhận markdown/json/csv...; hợp lệ của scope đó = `allowedMime` ⊕ `scopeMime[scope]`. Scope không khai = chỉ `allowedMime`.
     * Chỉ để client báo sớm — server vẫn kiểm cứng (`mime-policy.ts`).
     */
    scopeMime: Readonly<Record<string, readonly string[]>>;
    signedUrlTtlSeconds: number;
  };
  /** Cờ xác thực runtime (p0-13, khoá registry `auth`) — luôn có mặt (không optional) kể từ p0-07. */
  auth: {
    biometricLogin: { enabled: boolean };
    appLock: { enabled: boolean; lockAfterBackgroundSeconds: number };
  };
  serverNow: string;
}

/**
 * Trạng thái phân hệ + giới hạn hiện hành cho client (admin/app) tự bật/tắt UI
 * tương ứng — không hardcode danh sách module ở FE. Từ p0-07: hợp nhất
 * `RuntimeConfigService` (mã ⊕ env ⊕ `SystemConfig`, đã clamp) thay vì đọc
 * thẳng `LIMITS`/`FEATURE_FLAGS` — admin sửa `/admin/system-config/:key` phản
 * ánh ở đây trong ≤ `SYSTEM_CONFIG_CACHE_MS`.
 */
export async function buildCapabilities(): Promise<Capabilities> {
  const [limits, configVersion, auth, featureEntries, subFeatureEntries] = await Promise.all([
    runtimeConfig.getLimits(),
    runtimeConfig.configVersion(),
    runtimeConfig.getEffective("auth"),
    Promise.all(
      Object.values(MODULES).map(async (m): Promise<[ModuleId, CapabilityFeature]> => [
        m,
        {
          enabled: await runtimeConfig.isFeatureEnabled(m),
          available: AVAILABLE_MODULES.includes(m),
          ...(AI_BLOCKED.has(m) ? { blocked: "D-13" as const } : {}),
        },
      ])
    ),
    Promise.all(
      SUB_FEATURE_IDS.map(async (id): Promise<[SubFeatureId, CapabilityFeature]> => [
        id,
        {
          enabled: await runtimeConfig.isSubFeatureEnabled(id),
          // Ghi hình họp (p2-06) còn cần storage S3 + LiveKit Egress cùng bucket — thiếu thì app ẩn nút ghi hình dù phân hệ `meeting` bật.
          // Cờ phụ chưa có mã (`SUB_FEATURE_UNAVAILABLE`, vd `gif` của p7-04) luôn `available: false` — app ẩn mục dù admin bật cờ.
          available:
            AVAILABLE_MODULES.includes(SUB_FEATURE_PARENT[id]) &&
            !SUB_FEATURE_UNAVAILABLE.has(id) &&
            (id !== SUB_FEATURES.MEETING_RECORDING || isMeetingRecordingSupported()),
        },
      ])
    ),
  ]);

  const envMax = parseSize(env.MAX_FILE_SIZE);
  const allowedMime = [...new Set(Object.values(LIMITS.upload.kinds).flatMap((k) => [...k.mime]))];

  return {
    version: env.APP_VERSION,
    configVersion,
    features: Object.fromEntries([...featureEntries, ...subFeatureEntries]) as Record<ModuleId | SubFeatureId, CapabilityFeature>,
    limits,
    upload: {
      maxFileBytes: Math.min(envMax, LIMITS.upload.maxFileBytes),
      allowedMime,
      scopeMime: Object.fromEntries(Object.entries(LIMITS.upload.scopeMime).map(([scope, mimes]) => [scope, [...mimes]])),
      signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
    },
    auth: auth as Capabilities["auth"],
    serverNow: new Date().toISOString(),
  };
}
