import { env } from "../../core/config";
import { mediaErrors } from "./media.errors";

export interface LiveKitConfig {
  /** URL nội bộ BE → LiveKit (`http://livekit:7880` trong compose). */
  url: string;
  /** URL client kết nối (`wss://lk.<domain>`) — trả trong response cấp token. */
  publicUrl: string;
  apiKey: string;
  apiSecret: string;
}

export interface EgressS3Config {
  bucket: string;
  region: string;
  accessKey: string;
  secret: string;
  /** Tiền tố khoá object (kết thúc bằng `/`, mặc định `recordings/`). */
  prefix: string;
}

/** Đủ `LIVEKIT_URL` + `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` (chuỗi rỗng trong `.env` = chưa đặt). */
export function isLiveKitConfigured(): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}

/** `http(s)://host` → `ws(s)://host` (chỉ dùng làm mặc định dev khi thiếu `LIVEKIT_PUBLIC_URL`). */
export function toWebSocketUrl(url: string): string {
  return url.replace(/^http(s?):/i, (_m, s: string) => `ws${s}:`);
}

/** Thông tin gọi API server-to-server (không cần `LIVEKIT_PUBLIC_URL`). */
export function getLiveKitApiCredentials(): Pick<LiveKitConfig, "url" | "apiKey" | "apiSecret"> {
  if (!isLiveKitConfigured()) throw mediaErrors.notConfigured();
  return {
    url: env.LIVEKIT_URL as string,
    apiKey: env.LIVEKIT_API_KEY as string,
    apiSecret: env.LIVEKIT_API_SECRET as string,
  };
}

/**
 * Cấu hình LiveKit đã kiểm. Thiếu khoá → `MEDIA_001`. Thiếu `LIVEKIT_PUBLIC_URL`: dev suy từ `LIVEKIT_URL`;
 * production → `MEDIA_001` (URL nội bộ kiểu `http://livekit:7880` client KHÔNG với tới được) —
 * `validate-runtime` đã chặn khởi động trước đó khi cờ voice/meeting bật.
 */
export function getLiveKitConfig(): LiveKitConfig {
  if (!isLiveKitConfigured()) throw mediaErrors.notConfigured();
  const url = env.LIVEKIT_URL as string;
  let publicUrl = env.LIVEKIT_PUBLIC_URL;
  if (!publicUrl) {
    if (env.NODE_ENV === "production") throw mediaErrors.notConfigured("public-url");
    publicUrl = toWebSocketUrl(url);
  }
  return {
    url,
    publicUrl,
    apiKey: env.LIVEKIT_API_KEY as string,
    apiSecret: env.LIVEKIT_API_SECRET as string,
  };
}

/** Đích S3 cho egress; `null` khi thiếu bất kỳ khoá bắt buộc nào (ghi hình tắt). */
export function getEgressS3Config(): EgressS3Config | null {
  const { EGRESS_S3_BUCKET, EGRESS_S3_REGION, EGRESS_S3_ACCESS_KEY_ID, EGRESS_S3_SECRET_ACCESS_KEY } = env;
  if (!EGRESS_S3_BUCKET || !EGRESS_S3_REGION || !EGRESS_S3_ACCESS_KEY_ID || !EGRESS_S3_SECRET_ACCESS_KEY) {
    return null;
  }
  const raw = env.EGRESS_S3_PREFIX.replace(/^\/+/, "");
  return {
    bucket: EGRESS_S3_BUCKET,
    region: EGRESS_S3_REGION,
    accessKey: EGRESS_S3_ACCESS_KEY_ID,
    secret: EGRESS_S3_SECRET_ACCESS_KEY,
    prefix: raw === "" || raw.endsWith("/") ? raw : `${raw}/`,
  };
}

/**
 * (p2-06) Ghi hình cuộc họp khả dụng khi: LiveKit đã cấu hình, storage là S3 (Egress không đẩy được lên Cloudinary/đĩa API) và egress ghi vào ĐÚNG
 * bucket của storage asset — import `HEAD`, ký URL phát và xoá object đều đi qua `storage` (không có client S3 thứ hai). Chỉ đọc env, không gọi mạng.
 */
export function isMeetingRecordingSupported(): boolean {
  const target = getEgressS3Config();
  return isLiveKitConfigured() && env.STORAGE_TYPE === "s3" && target !== null && target.bucket === env.AWS_S3_BUCKET;
}
