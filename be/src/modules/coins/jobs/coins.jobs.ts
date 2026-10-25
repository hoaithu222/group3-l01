import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { getCoinsContainer } from "../coins.container";

/**
 * Job của `coins` (p7-02 be.md §7) — file side-effect nạp qua `register-jobs.ts` (worker không import `router.ts`).
 *
 * `gamification/xp.awarded`: gamification (p4-03) đăng ký SẴN một processor RỖNG cho job này ("chưa có consumer, chờ p7-02"); `registerJob` là `Map.set` nên đăng ký lần hai GHI ĐÈ — file này PHẢI được nạp
 * SAU `gamification.jobs` trong `register-jobs.ts` (đã đặt ngay sau). Sự kiện do outbox `XpEvent` (jobId `xp.awarded_<xpDedupeKey>`) giao ít nhất MỘT lần; `CoinEarnService` idempotent theo `XpEvent.dedupeKey` (COIN-02),
 * nên retry/giao lại không thưởng hai lần. Lỗi thoáng qua (write-conflict hết lượt thử) ném ra để BullMQ thử lại.
 */
registerJob("gamification", "xp.awarded", async (job) => {
  const result = await getCoinsContainer().earn.handleXpAwarded(job.data);
  if (result.outcome === "GRANTED") logger.debug("[xp.awarded] Đã thưởng xu", { id: job.id, coins: result.coins });
});

/** Đối soát ví ↔ sổ cái 02:30 hằng đêm: chỉ ĐỌC + cảnh báo (gauge `coins_reconcile_mismatch`), không tự sửa. */
registerJob("cron", "economy.reconcile", async () => {
  const report = await getCoinsContainer().reconcile.run();
  logger.info("[economy.reconcile] Hoàn tất", { checked: report.checked, mismatched: report.mismatched });
});

defineCron({ schedulerId: "economy.reconcile", queue: "cron", jobName: "economy.reconcile", pattern: "30 2 * * *", opts: { attempts: 1 } });
