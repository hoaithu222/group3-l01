import { createHmac } from "crypto";
import { env } from "../../../core/config";
import type { AssetVariant } from "../entities/asset.interface";

/**
 * Chữ ký của gateway tải Local `GET /assets/:id/download?variant&exp&sig` (chỉ `STORAGE_TYPE=local`, be.md §5.6).
 * Tách khỏi `AssetService` để `DisplayImageService` dựng CÙNG một kiểu URL — hai nơi tự tính HMAC thì lệch nhau là
 * ảnh hỏng im lặng.
 */
export function signLocalDownload(assetId: string, variant: AssetVariant, exp: number): string {
  return createHmac("sha256", Buffer.from(env.ENCRYPTION_KEY, "hex"))
    .update(`${assetId}|${variant}|${exp}`)
    .digest("hex");
}

export function buildLocalDownloadUrl(assetId: string, variant: AssetVariant, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signLocalDownload(assetId, variant, exp);
  return `${env.PUBLIC_API_URL}/api/v1/assets/${assetId}/download?variant=${variant}&exp=${exp}&sig=${sig}`;
}
