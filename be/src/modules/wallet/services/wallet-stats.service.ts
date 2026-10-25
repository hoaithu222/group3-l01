import { LIMITS } from "../../../core/constants/limits";
import { NotFoundError } from "../../../core/exceptions";
import { describeWeeklyCron } from "../domain/wallet-schedule";
import type { SpendBand, WalletStatsView } from "../entities/wallet.interface";
import type { IExpenseRepository } from "../repositories/expense.repository.interface";
import type { ISettlementRepository } from "../repositories/settlement.repository.interface";
import type { IWalletDirectory } from "../repositories/wallet-directory.interface";
import type { IWalletRepository } from "../repositories/wallet.repository.interface";
import { readWalletDefaults } from "../wallet-defaults";

const DAY_MS = 86_400_000;

export function spendBandOf(total: number): SpendBand {
  if (total < 500_000) return "LT_500K";
  if (total < 2_000_000) return "500K_2M";
  if (total < 10_000_000) return "2M_10M";
  return "GT_10M";
}

/**
 * Thống kê ẩn danh cho admin (admin.md §2.1): chỉ ĐẾM và dải giá trị — KHÔNG có userId, số tiền
 * chính xác, số dư, settlement hay tài khoản ngân hàng. Tên kênh chỉ khi kênh PUBLIC.
 */
export class WalletStatsService {
  constructor(
    private readonly walletRepo: IWalletRepository,
    private readonly expenseRepo: IExpenseRepository,
    private readonly settlementRepo: ISettlementRepository,
    private readonly directory: IWalletDirectory
  ) {}

  async stats(workspaceId: string): Promise<WalletStatsView> {
    if ((await this.directory.workspaceName(workspaceId)) === null) throw new NotFoundError("Không tìm thấy nhóm");

    const settings = await this.walletRepo.getSettings(workspaceId);
    const defaults = settings ? null : await readWalletDefaults(); // ví chưa có hàng cấu hình → mặc định hiện hành
    const now = Date.now();
    const since = new Date(now - 30 * DAY_MS);
    const staleBefore = new Date(now - LIMITS.wallet.settlementStaleHours * 3_600_000);

    const [expensesCount, spendTotal, confirmedSettlements, staleSettlements, balances] = await Promise.all([
      this.expenseRepo.countExpensesSince(workspaceId, since),
      this.expenseRepo.sumExpensesSince(workspaceId, since),
      this.settlementRepo.countSince(workspaceId, "CONFIRMED", since),
      this.settlementRepo.countStalePending(workspaceId, staleBefore),
      this.walletRepo.getBalances(workspaceId, null),
    ]);

    const targetType = settings?.reminderTargetType ?? "NONE";
    const targetChannelName =
      targetType === "CHANNEL" && settings?.reminderTargetId
        ? await this.directory.publicChannelName(workspaceId, settings.reminderTargetId)
        : null;

    return {
      enabled: settings?.enabled ?? true,
      reminder: {
        enabled: settings?.reminderEnabled ?? true,
        cronText: describeWeeklyCron(settings?.reminderCron ?? defaults?.reminderCron ?? LIMITS.wallet.defaultReminderCron, settings?.timezone ?? defaults?.timezone ?? LIMITS.wallet.defaultTz),
        targetType,
        targetChannelName,
      },
      last30d: {
        expensesCount,
        confirmedSettlements,
        staleSettlements,
        debtorsCount: balances.filter((b) => b.balance < 0).length,
        spendBand: spendBandOf(spendTotal),
      },
    };
  }
}
