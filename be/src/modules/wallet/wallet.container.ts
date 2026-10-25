import { createAssetLinkService } from "../assets/public";
import { AuditService } from "../audit-log/audit-log.service";
import { createSystemMessageService } from "../messages/public";
import { PrismaExpenseRepository } from "./repositories/expense.repository.prisma";
import { PrismaPaymentProfileRepository } from "./repositories/payment-profile.repository.prisma";
import { PrismaSettlementRepository } from "./repositories/settlement.repository.prisma";
import { PrismaWalletDirectory } from "./repositories/wallet-directory.repository.prisma";
import { PrismaWalletRepository } from "./repositories/wallet.repository.prisma";
import { ExpenseChangesService } from "./services/expense-changes.service";
import { ExpensesService } from "./services/expenses.service";
import { PaymentProfilesService } from "./services/payment-profiles.service";
import { SettlementsService } from "./services/settlements.service";
import { WalletExportService } from "./services/wallet-export.service";
import { WalletProjectionService } from "./services/wallet-projection.service";
import { WalletReminderService } from "./services/wallet-reminder.service";
import { WalletSettingsService } from "./services/wallet-settings.service";
import { WalletStatsService } from "./services/wallet-stats.service";
import { WalletSummaryService } from "./services/wallet-summary.service";
import { readWalletDefaults } from "./wallet-defaults";

/**
 * Nối dây DI cho module ví — dùng CHUNG bởi `wallet.routes.ts` và các job (tiến trình worker riêng
 * không import routes nên tự dựng lại, xem `jobs/*.job.ts`). Không có DI container trong codebase.
 */
export function createWalletContainer() {
  const walletRepo = new PrismaWalletRepository(readWalletDefaults);
  const expenseRepo = new PrismaExpenseRepository();
  const settlementRepo = new PrismaSettlementRepository();
  const profileRepo = new PrismaPaymentProfileRepository();
  const directory = new PrismaWalletDirectory();
  const assetLink = createAssetLinkService();
  const audit = new AuditService();

  const projection = new WalletProjectionService(walletRepo, expenseRepo);
  const expenses = new ExpensesService(expenseRepo, walletRepo, directory, projection, assetLink);
  const reminder = new WalletReminderService(walletRepo, directory, createSystemMessageService());

  return {
    walletRepo,
    expenseRepo,
    settlementRepo,
    directory,
    projection,
    reminder,
    expenses,
    expenseChanges: new ExpenseChangesService(expenseRepo, walletRepo, directory, projection, assetLink, expenses),
    settlements: new SettlementsService(settlementRepo, walletRepo, directory, projection, assetLink),
    summary: new WalletSummaryService(walletRepo, expenseRepo),
    settings: new WalletSettingsService(walletRepo, directory, reminder, audit),
    profiles: new PaymentProfilesService(profileRepo, walletRepo, audit),
    stats: new WalletStatsService(walletRepo, expenseRepo, settlementRepo, directory),
    exporter: new WalletExportService(expenseRepo, settlementRepo, directory),
  };
}

export type WalletContainer = ReturnType<typeof createWalletContainer>;

let cached: WalletContainer | null = null;

/** Singleton lười cho job (worker không import routes) — tránh dựng lại repo/service mỗi lần job chạy. */
export function getWalletContainer(): WalletContainer {
  cached ??= createWalletContainer();
  return cached;
}
