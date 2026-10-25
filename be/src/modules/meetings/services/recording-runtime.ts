import { runtimeConfig } from "../../../core/config/runtime-config";
import { LIMITS } from "../../../core/constants/limits";
import { SUB_FEATURES } from "../../../core/constants/modules";
import { getEgressS3Config, isMeetingRecordingSupported } from "../../../infrastructure/media";
import { storage } from "../../../infrastructure/storage";

/** Cổng storage cho tệp ghi hình — bản thật đi qua `storage` (S3); test thay bản giả (không cần S3). */
export interface RecordingStoragePort {
  /** `null` khi object chưa có. */
  head(key: string): Promise<{ size: number } | null>;
  /** URL ký (S3 presigned GET) — TTL do caller chọn (900 s phát / 60 s tải). */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  /** Xoá object; object không tồn tại = thành công. */
  deleteObjects(keys: string[]): Promise<void>;
}

export class InfraRecordingStorage implements RecordingStoragePort {
  async head(key: string): Promise<{ size: number } | null> {
    const found = await storage.head(key);
    return found ? { size: found.size } : null;
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    return storage.getSignedUrl(key, ttlSeconds);
  }

  deleteObjects(keys: string[]): Promise<void> {
    return storage.deleteMany(keys);
  }
}

/**
 * Ghi hình có dùng được không (be.md §9): `available` = hạ tầng (LiveKit + S3 + Egress cùng bucket, chỉ đọc env), `enabled` = cờ phụ `meetingRecording`
 * trong `SystemConfig` (mặc định BẬT, chỉ hiệu lực khi phân hệ `meeting` bật). Test thay bản giả.
 */
export interface RecordingCapability {
  available(): boolean;
  enabled(): Promise<boolean>;
  /** Tiền tố khoá object (kết thúc bằng `/`) — trùng `EGRESS_S3_PREFIX` để `filepath` không bị thêm tiền tố lần nữa. */
  keyPrefix(): string;
}

export class EnvRecordingCapability implements RecordingCapability {
  available(): boolean {
    return isMeetingRecordingSupported();
  }

  enabled(): Promise<boolean> {
    return runtimeConfig.isSubFeatureEnabled(SUB_FEATURES.MEETING_RECORDING);
  }

  keyPrefix(): string {
    return getEgressS3Config()?.prefix ?? "recordings/";
  }
}

export interface RecordingRuntimeLimits {
  retentionDays: number;
  concurrentMax: number;
  maxMinutes: number;
  consentRequestTtlSeconds: number;
  playbackUrlTtlSeconds: number;
  downloadUrlTtlSeconds: number;
  importMaxAttempts: number;
  /** Số tệp đính kèm tối đa của biên bản (`limits.meetingRecap`). */
  attachmentsMax: number;
  contentMax: number;
}

/** Giới hạn HIỆU LỰC: mã ⊕ `SystemConfig` (`limits.recording`, `limits.meetingRecap`) đã clamp — admin đổi có hiệu lực ≤ `SYSTEM_CONFIG_CACHE_MS`. */
export async function loadRecordingLimits(): Promise<RecordingRuntimeLimits> {
  const [rec, recap] = await Promise.all([runtimeConfig.getEffective("limits.recording"), runtimeConfig.getEffective("limits.meetingRecap")]);
  const num = (o: Record<string, unknown>, k: string, d: number): number => {
    const v = o[k];
    return typeof v === "number" ? v : d;
  };
  return {
    retentionDays: num(rec, "retentionDays", LIMITS.recording.retentionDays),
    concurrentMax: num(rec, "concurrentMax", LIMITS.recording.concurrentMax),
    maxMinutes: num(rec, "maxMinutes", LIMITS.recording.maxMinutes),
    consentRequestTtlSeconds: LIMITS.recording.consentRequestTtlSeconds,
    playbackUrlTtlSeconds: LIMITS.recording.playbackUrlTtlSeconds,
    downloadUrlTtlSeconds: LIMITS.recording.downloadUrlTtlSeconds,
    importMaxAttempts: LIMITS.recording.importMaxAttempts,
    attachmentsMax: num(recap, "attachmentsMax", LIMITS.meetingRecap.attachmentsMax),
    contentMax: LIMITS.meetingRecap.contentMax,
  };
}
