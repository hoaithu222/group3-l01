import { uploadService } from './upload.service';
import type { AssetDto } from './upload.types';

/** Bậc backoff be.md §3 — "0.5→3 s, tối đa 30 s", lặp lại bậc cuối sau đó. */
const BACKOFF_MS = [500, 1000, 2000, 3000];
const TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chờ asset thoát khỏi `PROCESSING` sau `POST /assets/:id/complete` — be.md §3
 * "app poll GET /assets/:id tối đa 30 s" (BE cố ý KHÔNG bắn socket cho asset,
 * xem be.md §3 "chốt: poll").
 *
 * Luôn TRẢ VỀ dto cuối cùng đọc được, kể cả khi hết 30 s mà vẫn `PROCESSING` —
 * `upload.pipeline.ts` (nơi gọi) tự quyết định coi đó là lỗi tạm thời.
 */
export async function pollReady(assetId: string): Promise<AssetDto> {
  const startedAt = Date.now();
  let asset = await uploadService.getAssetById(assetId);
  let step = 0;

  while (asset.status === 'PROCESSING' && Date.now() - startedAt < TIMEOUT_MS) {
    await sleep(BACKOFF_MS[Math.min(step, BACKOFF_MS.length - 1)] ?? 3000);
    asset = await uploadService.getAssetById(assetId);
    step += 1;
  }

  return asset;
}
