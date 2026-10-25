import { registerJob, defineCron } from "../../../infrastructure/queue";
import { withTransaction } from "../../../infrastructure/database";
import { logger } from "../../../infrastructure/logger";
import { LIMITS } from "../../../core/constants/limits";
import { notify } from "../../notifications/public";
import "../services/wallet-notifications";
import { getWalletContainer } from "../wallet.container";

const BATCH = 200;

/**
 * `wallet.settlement-stale` (hằng giờ): settlement PENDING quá `settlementStaleHours` → nhắc NGƯỜI NHẬN xác nhận
 * đúng 1 lần (`staleNotifiedAt`). Thông báo có thể đã ghi nhưng chưa kịp đánh dấu (crash) nên kiểm tồn tại trước —
 * `notify()` không idempotent với outbox `deliver`.
 */
registerJob("cron", "wallet.settlement-stale", async () => {
  const { settlementRepo, directory } = getWalletContainer();
  const now = new Date();
  const stale = await settlementRepo.listStalePending(new Date(now.getTime() - LIMITS.wallet.settlementStaleHours * 3_600_000), BATCH);

  for (const s of stale) {
    const dedupeKey = `wallet.settlement-stale:${s.id}`;
    try {
      if (!(await directory.notificationExists(dedupeKey))) {
        await withTransaction((tx) =>
          notify(tx, {
            type: "wallet.settlement-stale",
            scope: { type: "WORKSPACE", id: s.workspaceId },
            workspaceId: s.workspaceId,
            source: { type: "wallet-settlement", id: `${s.id}-stale` },
            refs: { workspaceId: s.workspaceId, settlementId: s.id },
            recipients: [{ userId: s.toId }],
            dedupeKey,
          })
        );
      }
      await settlementRepo.markStaleNotified(s.id, now);
    } catch (err) {
      logger.error("[wallet.settlement-stale] Lỗi nhắc xác nhận", { settlementId: s.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (stale.length > 0) logger.info("[wallet.settlement-stale] Đã xử lý", { count: stale.length });
});

defineCron({
  schedulerId: "wallet.settlement-stale",
  queue: "cron",
  jobName: "wallet.settlement-stale",
  pattern: "0 * * * *",
  opts: { attempts: 1 },
});
