import type { AuthUser } from "../../../core/types/express";
import { minCashFlow } from "../domain/wallet-math";
import type { WalletSummaryView } from "../entities/wallet.interface";
import type { IExpenseRepository } from "../repositories/expense.repository.interface";
import type { IWalletRepository } from "../repositories/wallet.repository.interface";
import { readWalletDefaults } from "../wallet-defaults";
import { assertWalletRole } from "./wallet-access";
import { startOfMonthInTz } from "./wallet-support";

/** `GET /wallet/summary`: số dư của tôi + của cả nhóm + gợi ý thanh toán tối giản (tính KHI ĐỌC, không lưu). */
export class WalletSummaryService {
  constructor(
    private readonly walletRepo: IWalletRepository,
    private readonly expenseRepo: IExpenseRepository
  ) {}

  async summary(actor: AuthUser, workspaceId: string): Promise<WalletSummaryView> {
    await assertWalletRole(actor, workspaceId);
    const settings = await this.walletRepo.getSettings(workspaceId);
    // Ví chưa có hàng cấu hình → múi giờ MẶC ĐỊNH hiện hành (cùng giá trị `ensureSettings` sẽ ghi khi ví được tạo).
    const timezone = settings?.timezone ?? (await readWalletDefaults()).timezone;

    const rows = (await this.walletRepo.getBalances(workspaceId, null)).filter((b) => b.balance !== 0);
    const balances = new Map(rows.map((b) => [b.userId, b.balance]));
    const outstanding = rows.reduce((sum, b) => sum + Math.max(0, -b.balance), 0);
    const expensesThisMonth = await this.expenseRepo.sumExpensesSince(workspaceId, startOfMonthInTz(new Date(), timezone));

    return {
      currency: settings?.currency ?? "VND",
      myBalance: balances.get(actor.id) ?? 0,
      balances: rows.map((b) => ({ userId: b.userId, balance: b.balance })),
      suggestions: minCashFlow(balances),
      totals: { expensesThisMonth, outstanding },
      walletVersion: settings?.walletVersion ?? 0,
    };
  }
}
