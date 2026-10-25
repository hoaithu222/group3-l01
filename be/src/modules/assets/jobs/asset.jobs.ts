import { registerJob, defineCron } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { env } from "../../../core/config";
import { storage } from "../../../infrastructure/storage";
import { PrismaAssetRepository, PrismaAssetLinkRepository } from "../repositories";
import { AssetProcessor } from "../services/asset-processor";

const repo = new PrismaAssetRepository();
const linkRepo = new PrismaAssetLinkRepository();
const processor = new AssetProcessor(repo);

/** Cỡ lô 1 lượt chạy `assets.cleanup` (be.md §5.7 — "lô 500"). */
const CLEANUP_BATCH = 500;

/**
 * `asset.process` (queue `media`) — kiểm magic bytes thật, sinh thumbnail
 * ảnh, đọc thời lượng audio/voice/video → `READY`/`REJECTED` (be.md §5.3).
 * Idempotent: `AssetProcessor.process()` tự CAS theo `status === PROCESSING`
 * (gọi lại khi đã `READY`/`REJECTED` là no-op).
 *
 * Lưu ý retry: job này chạy qua outbox → `enqueue()` dùng
 * `DEFAULT_JOB_OPTIONS` của queue `media` (3 lần, backoff luỹ thừa từ 2s) —
 * be.md §7 muốn 5 lần/5s riêng cho `asset.process`, nhưng `outbox.relay`
 * (p0-04) hiện KHÔNG cho truyền `JobsOptions` theo từng loại sự kiện (đổi
 * hạ tầng dùng chung cho mọi module outbox để phục vụ đúng 1 job là rủi ro
 * không tương xứng ở lượt này) — cố tình lệch, ghi rõ ở README.
 */
registerJob("media", "asset.process", async (job) => {
  const { assetId } = job.data as { assetId: string };
  await processor.process(assetId);
});

/**
 * `assets.cleanup` (queue `cron`, chạy mỗi giờ, be.md §5.7) — xoá asset gốc
 * (`UPLOADING|PROCESSING|READY|REJECTED`) quá `ASSET_ORPHAN_TTL_HOURS` tính
 * từ `coalesce(lastUnlinkedAt, createdAt)` VÀ chưa/không còn gắn `AssetLink`
 * nào — xoá cả thumbnail con.
 */
registerJob("cron", "assets.cleanup", async () => {
  const olderThan = new Date(Date.now() - env.ASSET_ORPHAN_TTL_HOURS * 3600_000);
  const candidates = await repo.findCleanupCandidates(olderThan, CLEANUP_BATCH);

  let deletedCount = 0;
  for (const asset of candidates) {
    const linked = await linkRepo.existsForAsset(asset.id);
    if (linked) continue;

    const children = await repo.findChildren(asset.id);
    const keys = [asset.storageKey, ...children.map((c) => c.storageKey)].filter((k) => k.length > 0);
    await storage.deleteMany(keys).catch((err) => {
      logger.warn("[assets.cleanup] Xoá object storage thất bại", {
        assetId: asset.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    await repo.markDeleted(asset.id);
    await Promise.all(children.map((c) => repo.markDeleted(c.id)));
    deletedCount += 1;
  }

  logger.info("[assets.cleanup] Đã dọn asset mồ côi", {
    candidates: candidates.length,
    deleted: deletedCount,
  });
});

defineCron({
  schedulerId: "assets.cleanup",
  queue: "cron",
  jobName: "assets.cleanup",
  pattern: "0 * * * *",
});
