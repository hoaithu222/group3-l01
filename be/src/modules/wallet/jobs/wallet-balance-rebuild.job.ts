import { registerJob, defineCron } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { computeBalances, computeOwedTotals } from "../domain/wallet-math";
import type { WalletBalanceRow } from "../entities/wallet.interface";
import { getWalletContainer } from "../wallet.container";

/**
 * `wallet.balance-rebuild` (03:10 hằng đêm): tính lại số dư ròng từ share + settlement CONFIRMED (nguồn sự thật)
 * và đối chiếu `WalletBalance` phi chuẩn hoá. Lệch → ghi log cảnh báo + sửa (be.md §7).
 */
registerJob("cron", "wallet.balance-rebuild", async () => {
  const { walletRepo, expenseRepo, settlementRepo } = getWalletContainer();
  let fixedWorkspaces = 0;

  for (const wallet of await walletRepo.listReminderSchedules()) {
    const { workspaceId } = wallet;
    try {
      const shares = await expenseRepo.listAllActiveShares(workspaceId);
      const flows = (await settlementRepo.listConfirmed(workspaceId)).map((s) => ({ fromId: s.fromId, toId: s.toId, amount: s.amount }));
      const balances = computeBalances(shares, flows);
      const owed = computeOwedTotals(shares);
      const stored = new Map((await walletRepo.getBalances(workspaceId, null)).map((b) => [b.userId, b]));

      const mismatched: WalletBalanceRow[] = [];
      for (const userId of new Set([...balances.keys(), ...owed.keys(), ...stored.keys()])) {
        const expected = { userId, balance: balances.get(userId) ?? 0, owedTotal: owed.get(userId) ?? 0 };
        const current = stored.get(userId);
        if (!current || current.balance !== expected.balance || current.owedTotal !== expected.owedTotal) mismatched.push(expected);
      }
      if (mismatched.length === 0) continue;

      // Chỉ ghi số lượng, không ghi số tiền/userId (log không được chứa dữ liệu tài chính).
      logger.warn("[wallet.balance-rebuild] Số dư lệch, đang sửa", { workspaceId, mismatched: mismatched.length });
      await walletRepo.overwriteBalances(workspaceId, mismatched);
      fixedWorkspaces += 1;
    } catch (err) {
      logger.error("[wallet.balance-rebuild] Lỗi rebuild", { workspaceId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  logger.info("[wallet.balance-rebuild] Hoàn tất", { fixedWorkspaces });
});

defineCron({
  schedulerId: "wallet.balance-rebuild",
  queue: "cron",
  jobName: "wallet.balance-rebuild",
  pattern: "10 3 * * *",
  opts: { attempts: 1 },
});
