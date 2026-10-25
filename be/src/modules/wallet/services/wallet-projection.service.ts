import { projectShares } from "../domain/wallet-math";
import type { ExpenseShare } from "../entities/wallet.interface";
import type { IExpenseRepository } from "../repositories/expense.repository.interface";
import type { BalanceDelta, IWalletRepository, Tx } from "../repositories/wallet.repository.interface";

export interface ShareChange {
  shareId: string;
  before: number;
  after: number;
}

export interface ProjectionResult {
  walletVersion: number;
  changedUserIds: string[];
  /** Thay đổi `paidAmount` theo người nợ — dùng để ghi `Settlement.allocations`. */
  shareChanges: Map<string, ShareChange[]>;
}

/**
 * Cập nhật số dư ròng + phép chiếu trạng thái share TRONG transaction của caller (be.md §5).
 * Nguồn sự thật là số dư ròng (`WalletBalance`); `ExpenseShare.status/paidAmount` chỉ là phép
 * chiếu FIFO để hiển thị "khoản nào đã xong" nhất quán với số dư.
 */
export class WalletProjectionService {
  constructor(
    private readonly walletRepo: IWalletRepository,
    private readonly expenseRepo: IExpenseRepository
  ) {}

  /**
   * `alsoReproject`: người cần chiếu lại share DÙ số dư không đổi — vd sửa khoản chi làm xoá-tạo-lại share (id mới
   * → thứ tự FIFO giữa các share cùng `occurredAt` có thể đổi) trong khi chênh lệch số dư ròng bằng 0.
   */
  async apply(tx: Tx, workspaceId: string, deltas: BalanceDelta[], alsoReproject: string[] = []): Promise<ProjectionResult> {
    const effective = mergeDeltas(deltas);
    if (effective.length > 0) await this.walletRepo.incBalances(workspaceId, effective, tx);
    const userIds = [...new Set([...effective.map((d) => d.userId), ...alsoReproject])];

    const balances = new Map(
      (await this.walletRepo.getBalances(workspaceId, userIds, tx)).map((b) => [b.userId, b.balance])
    );
    const shares = await this.expenseRepo.listActiveSharesOfDebtors(workspaceId, userIds, tx);
    const byDebtor = groupBy(shares, (s) => s.debtorId);

    const shareChanges = new Map<string, ShareChange[]>();
    for (const userId of userIds) {
      const own = byDebtor.get(userId) ?? [];
      if (own.length === 0) continue;
      const outstanding = Math.max(0, -(balances.get(userId) ?? 0));
      const projected = projectShares(own.map((s) => ({ id: s.id, amount: s.amount, occurredAt: s.occurredAt })), outstanding);
      const current = new Map(own.map((s) => [s.id, s]));
      const changes: ShareChange[] = [];
      for (const p of projected) {
        const prev = current.get(p.id) as ExpenseShare;
        if (prev.paidAmount === p.paidAmount && prev.status === p.status) continue;
        await this.expenseRepo.updateShareProjection(p.id, p.paidAmount, p.status, tx);
        changes.push({ shareId: p.id, before: prev.paidAmount, after: p.paidAmount });
      }
      if (changes.length > 0) shareChanges.set(userId, changes);
    }

    const walletVersion = await this.walletRepo.bumpWalletVersion(workspaceId, tx);
    return { walletVersion, changedUserIds: userIds, shareChanges };
  }
}

/** Gộp delta cùng người, bỏ delta rỗng (0/0). */
function mergeDeltas(deltas: BalanceDelta[]): BalanceDelta[] {
  const merged = new Map<string, BalanceDelta>();
  for (const d of deltas) {
    const cur = merged.get(d.userId) ?? { userId: d.userId, balance: 0, owedTotal: 0 };
    cur.balance += d.balance;
    cur.owedTotal += d.owedTotal;
    merged.set(d.userId, cur);
  }
  return [...merged.values()].filter((d) => d.balance !== 0 || d.owedTotal !== 0);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
