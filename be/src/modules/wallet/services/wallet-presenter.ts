import type {
  Expense,
  ExpenseDetailView,
  ExpenseShare,
  ExpenseView,
  MyShareView,
  PaymentProfile,
  PaymentProfileView,
  Settlement,
  SettlementView,
  ShareView,
  WalletSettings,
  WalletSettingsView,
} from "../entities/wallet.interface";
import { bankNameOf } from "../domain/vn-banks";

export function toSettingsView(s: WalletSettings, canManage: boolean): WalletSettingsView {
  return {
    workspaceId: s.workspaceId,
    currency: s.currency,
    enabled: s.enabled,
    reminderEnabled: s.reminderEnabled,
    reminderCron: s.reminderCron,
    timezone: s.timezone,
    reminderTargetType: s.reminderTargetType,
    reminderTargetId: s.reminderTargetId,
    reminderMinDebt: s.reminderMinDebt,
    lastRemindedAt: s.lastRemindedAt,
    walletVersion: s.walletVersion,
    version: s.version,
    myActions: { canManageSettings: canManage, canRemind: canManage },
  };
}

function toMyShare(share: ExpenseShare | undefined): MyShareView | null {
  return share ? { amount: share.amount, paidAmount: share.paidAmount, status: share.status } : null;
}

/** `myShare` = phần của NGƯỜI XEM (người khác không lộ ở danh sách); `canManage` = người tạo hoặc ADMIN+. */
export function toExpenseView(e: Expense, viewerId: string, viewerIsAdmin: boolean, myShare?: ExpenseShare): ExpenseView {
  return {
    id: e.id,
    workspaceId: e.workspaceId,
    kind: e.kind,
    adjustsExpenseId: e.adjustsExpenseId,
    amount: e.amount,
    description: e.description,
    category: e.category,
    paidBy: e.paidBy,
    splitType: e.splitType,
    participants: e.participants,
    receiptAssetId: e.receiptAssetId,
    occurredAt: e.occurredAt,
    createdBy: e.createdBy,
    version: e.version,
    createdAt: e.createdAt,
    myShare: toMyShare(myShare),
    canManage: e.kind === "EXPENSE" && (viewerIsAdmin || e.createdBy === viewerId),
  };
}

export function toShareView(s: ExpenseShare): ShareView {
  return { id: s.id, debtorId: s.debtorId, creditorId: s.creditorId, amount: s.amount, paidAmount: s.paidAmount, status: s.status };
}

export function toExpenseDetailView(
  e: Expense,
  shares: ExpenseShare[],
  adjustments: Expense[],
  viewerId: string,
  viewerIsAdmin: boolean
): ExpenseDetailView {
  const mine = shares.find((s) => s.debtorId === viewerId);
  return {
    ...toExpenseView(e, viewerId, viewerIsAdmin, mine),
    shares: shares.map(toShareView),
    adjustments: adjustments.map((a) => toExpenseView(a, viewerId, viewerIsAdmin)),
  };
}

export function toSettlementView(s: Settlement): SettlementView {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    code: s.code,
    fromId: s.fromId,
    toId: s.toId,
    amount: s.amount,
    method: s.method,
    proofAssetId: s.proofAssetId,
    note: s.note,
    status: s.status,
    allocations: s.allocations,
    confirmedAt: s.confirmedAt,
    rejectedAt: s.rejectedAt,
    rejectReason: s.rejectReason,
    cancelledAt: s.cancelledAt,
    version: s.version,
    createdAt: s.createdAt,
  };
}

/** KHÔNG trả `accountNumberEnc` — danh sách chỉ có 4 số cuối. */
export function toPaymentProfileView(p: PaymentProfile): PaymentProfileView {
  return {
    id: p.id,
    bankBin: p.bankBin,
    bankName: bankNameOf(p.bankBin),
    accountLast4: p.accountLast4,
    accountName: p.accountName,
    isDefault: p.isDefault,
    createdAt: p.createdAt,
  };
}
