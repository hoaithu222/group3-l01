import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { normalizeSearch } from "../../../core/utils/normalize";
import { isSplitTotalValid, type Share, type SplitInput } from "../domain/wallet-math";
import type { ExpenseParticipantRow } from "../entities/wallet.interface";
import type { NewShare } from "../repositories/expense.repository.interface";
import type { IWalletDirectory } from "../repositories/wallet-directory.interface";
import type { BalanceDelta } from "../repositories/wallet.repository.interface";
import type { WalletLimits } from "./wallet-support";

export function walletError(code: (typeof ErrorCode)[keyof typeof ErrorCode], status: 400 | 409 | 429, details?: unknown): AppError {
  return new AppError(ErrorMessages[code], status, code, details);
}

/** Số dư của các phần chia: người trả `+amount`, người nợ `−amount` và `owedTotal +amount` (sign=-1 để hoàn tác). */
export function deltasOfShares(shares: Pick<Share, "debtorId" | "creditorId" | "amount">[], sign: 1 | -1 = 1): BalanceDelta[] {
  const out: BalanceDelta[] = [];
  for (const s of shares) {
    out.push({ userId: s.creditorId, balance: sign * s.amount, owedTotal: 0 });
    out.push({ userId: s.debtorId, balance: -sign * s.amount, owedTotal: sign * s.amount });
  }
  return out;
}

export function toShareRows(expenseId: string, workspaceId: string, shares: Share[], occurredAt: Date): NewShare[] {
  return shares.map((s) => ({
    expenseId,
    workspaceId,
    debtorId: s.debtorId,
    creditorId: s.creditorId,
    amount: s.amount,
    occurredAt,
  }));
}

export function toParticipantRows(participants: { userId: string; amount?: number | null; bps?: number | null }[]): ExpenseParticipantRow[] {
  return participants.map((p) => ({ userId: p.userId, amount: p.amount ?? null, bps: p.bps ?? null }));
}

export const normalizeDescription = (text: string): string => normalizeSearch(text);

/** WALLET_001: mọi người tham gia + người trả phải là thành viên ACTIVE (MEMBER+, không GUEST) của nhóm. */
export async function assertActiveMembers(directory: IWalletDirectory, workspaceId: string, userIds: string[]): Promise<void> {
  const ids = [...new Set(userIds)];
  const roles = await directory.activeRoles(workspaceId, ids);
  const invalid = ids.filter((id) => {
    const role = roles.get(id);
    return !role || role === "GUEST";
  });
  if (invalid.length > 0) throw walletError(ErrorCode.WALLET_001, 400, { invalidUserIds: invalid });
}

/** WALLET_002 khi tổng chia lệch; số tiền/số người vượt trần cấu hình → 400 chung. */
export function assertSplitConsistent(input: SplitInput, limits: WalletLimits): void {
  if (input.amount > limits.expenseMax) {
    throw new AppError(`Số tiền tối đa mỗi khoản là ${limits.expenseMax}`, 400, ErrorCode.VAL_001);
  }
  if (input.participants.length > limits.participantsMax) {
    throw new AppError(`Tối đa ${limits.participantsMax} người tham gia`, 400, ErrorCode.VAL_001);
  }
  if (!isSplitTotalValid(input)) throw walletError(ErrorCode.WALLET_002, 400);
}

/** WALLET_003: ảnh hoá đơn/chứng từ phải của người gọi và đã READY. */
export async function assertAssetReady(directory: IWalletDirectory, assetId: string | null | undefined, ownerId: string): Promise<void> {
  if (assetId && !(await directory.isAssetReady(assetId, ownerId))) throw walletError(ErrorCode.WALLET_003, 400);
}
