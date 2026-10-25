import { registerJob, defineCron } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { lastFireAt } from "../domain/wallet-schedule";
import { getWalletContainer } from "../wallet.container";

/** Bắt bù tối đa ngần này sau mốc lịch (worker tắt/khởi động lại) — quá thì bỏ lượt, chờ tuần sau. */
const CATCH_UP_MS = 6 * 3_600_000;

/**
 * `wallet.remind-tick` (queue `cron`, mỗi 5 phút). Thay cho scheduler theo từng ví (be.md §7): `syncCronSchedulers()`
 * xoá mọi scheduler không nằm trong registry tĩnh nên scheduler động sẽ bị dọn mỗi lần khởi động. Mỗi lượt tick tìm
 * mốc bắn gần nhất của lịch từng ví (theo múi giờ ví) và nhắc nếu chưa nhắc kể từ mốc đó. Đổi cron có hiệu lực ở tick sau.
 */
registerJob("cron", "wallet.remind-tick", async () => {
  const { walletRepo, reminder } = getWalletContainer();
  const now = new Date();
  let reminded = 0;

  for (const wallet of await walletRepo.listReminderSchedules()) {
    if (!wallet.enabled || !wallet.reminderEnabled) continue;
    const fire = lastFireAt(wallet.reminderCron, wallet.timezone, now);
    if (!fire || now.getTime() - fire.getTime() > CATCH_UP_MS) continue;
    if (wallet.lastRemindedAt && wallet.lastRemindedAt.getTime() >= fire.getTime()) continue;
    try {
      reminded += await reminder.remind(wallet.workspaceId, { now });
    } catch (err) {
      logger.error("[wallet.remind-tick] Nhắc nợ lỗi", { workspaceId: wallet.workspaceId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (reminded > 0) logger.info("[wallet.remind-tick] Đã nhắc nợ", { reminded });
});

defineCron({
  schedulerId: "wallet.remind-tick",
  queue: "cron",
  jobName: "wallet.remind-tick",
  pattern: "*/5 * * * *",
  opts: { attempts: 1 },
});
