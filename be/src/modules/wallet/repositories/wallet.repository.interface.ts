import type { Prisma } from "@prisma/client";
import type { ReminderTargetValue, WalletBalanceRow, WalletSettings } from "../entities/wallet.interface";

export type Tx = Prisma.TransactionClient;

export interface SettingsPatch {
  reminderEnabled: boolean;
  reminderCron: string;
  timezone: string;
  reminderTargetType: ReminderTargetValue;
  reminderTargetId: string | null;
  reminderMinDebt: number;
}

export interface BalanceDelta {
  userId: string;
  balance: number;
  owedTotal: number;
}

/**
 * Cài đặt ví + số dư ròng. Ghi nhận `tx` tuỳ chọn để cùng transaction với khoản chi/settlement
 * (service ghi nhiều collection ATOMIC — xem `wallet-projection.service.ts`).
 */
export interface IWalletRepository {
  getSettings(workspaceId: string, tx?: Tx): Promise<WalletSettings | null>;
  /** Tạo ví với mặc định nếu chưa có (idempotent). */
  ensureSettings(workspaceId: string, tx?: Tx): Promise<WalletSettings>;
  /** CAS theo `version` — trả `null` nếu lệch version (caller ném `VersionConflictError`). */
  updateSettings(workspaceId: string, expectedVersion: number, patch: SettingsPatch, tx?: Tx): Promise<WalletSettings | null>;
  /** `walletVersion += 1` — trả về giá trị MỚI. Tạo ví mặc định nếu chưa có. */
  bumpWalletVersion(workspaceId: string, tx: Tx): Promise<number>;
  markReminded(workspaceId: string, at: Date, manual: boolean): Promise<void>;
  listReminderSchedules(): Promise<Pick<WalletSettings, "workspaceId" | "reminderCron" | "timezone" | "reminderEnabled" | "enabled" | "lastRemindedAt">[]>;

  /**
   * Tạo trước dòng số dư (0/0) cho người chưa có — gọi NGOÀI transaction để `incBalances` trong tx luôn đi đường
   * update (xung đột ghi → transient → tự retry) thay vì 2 tx cùng insert 1 khoá rồi 1 bên dính duplicate-key (không retry được).
   */
  ensureBalances(workspaceId: string, userIds: string[]): Promise<void>;
  /** `$inc` số dư (upsert theo `(workspaceId, userId)`). */
  incBalances(workspaceId: string, deltas: BalanceDelta[], tx: Tx): Promise<void>;
  /** `userIds=null` → mọi người có bản ghi số dư của workspace. */
  getBalances(workspaceId: string, userIds: string[] | null, tx?: Tx): Promise<WalletBalanceRow[]>;
  /** Ghi ĐÈ số dư (chỉ `wallet.balance-rebuild`). */
  overwriteBalances(workspaceId: string, rows: WalletBalanceRow[]): Promise<void>;
}
