import type {
  Expense,
  ExpenseKindValue,
  ExpenseParticipantRow,
  ExpenseShare,
  ShareStatusValue,
  SplitTypeValue,
} from "../entities/wallet.interface";
import type { Tx } from "./wallet.repository.interface";

export interface NewExpense {
  workspaceId: string;
  kind: ExpenseKindValue;
  adjustsExpenseId: string | null;
  amount: number;
  description: string;
  normalizedDescription: string;
  category: string;
  paidBy: string;
  splitType: SplitTypeValue;
  participants: ExpenseParticipantRow[];
  receiptAssetId: string | null;
  occurredAt: Date;
  createdBy: string;
}

export interface NewShare {
  expenseId: string;
  workspaceId: string;
  debtorId: string;
  creditorId: string;
  amount: number;
  occurredAt: Date;
}

export interface ExpensePatch {
  amount: number;
  description: string;
  normalizedDescription: string;
  category: string;
  paidBy: string;
  splitType: SplitTypeValue;
  participants: ExpenseParticipantRow[];
  receiptAssetId: string | null;
  occurredAt: Date;
}

export interface ExpenseListFilter {
  userId?: string;
  category?: string;
  from?: Date;
  to?: Date;
  cursor: { at: Date; id: string } | null;
  limit: number;
}

/** Khoản chi + phần chia (share). Mọi ghi nhận `tx` — chạy trong transaction của service. */
export interface IExpenseRepository {
  create(data: NewExpense, tx: Tx): Promise<Expense>;
  findById(id: string, tx?: Tx): Promise<Expense | null>;
  /** CAS theo `version` — `null` nếu lệch/không tồn tại. Tăng `version`. */
  update(id: string, expectedVersion: number, patch: ExpensePatch, tx: Tx): Promise<Expense | null>;
  softDelete(id: string, actorId: string, tx: Tx): Promise<boolean>;
  /** Khoản điều chỉnh (chưa xoá) của 1 khoản gốc. */
  listAdjustments(expenseId: string, tx?: Tx): Promise<Expense[]>;
  /** `MEMBER` chỉ thấy khoản chi liên quan tới mọi người (cả nhóm) — lọc `userId` theo người trả HOẶC có share. */
  list(workspaceId: string, filter: ExpenseListFilter): Promise<Expense[]>;

  createShares(rows: NewShare[], tx: Tx): Promise<void>;
  listShares(expenseId: string, tx?: Tx): Promise<ExpenseShare[]>;
  listSharesForExpenses(expenseIds: string[], tx?: Tx): Promise<ExpenseShare[]>;
  /** Share chưa VOID của các người nợ — đầu vào phép chiếu FIFO. */
  listActiveSharesOfDebtors(workspaceId: string, debtorIds: string[], tx?: Tx): Promise<ExpenseShare[]>;
  listAllActiveShares(workspaceId: string): Promise<ExpenseShare[]>;
  listSharesOfDebtorForExpenses(expenseIds: string[], debtorId: string): Promise<ExpenseShare[]>;
  updateShareProjection(id: string, paidAmount: number, status: ShareStatusValue, tx: Tx): Promise<void>;
  deleteShares(expenseId: string, tx: Tx): Promise<void>;
  voidShares(expenseId: string, tx: Tx): Promise<void>;

  sumExpensesSince(workspaceId: string, since: Date): Promise<number>;
  countExpensesSince(workspaceId: string, since: Date): Promise<number>;
}
