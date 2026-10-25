import type { WalletSummaryView } from '../api';

/**
 * Trần số tiền tôi trả được cho `toId`: `min(nợ của tôi, số người kia được nợ)` — đúng điều
 * kiện BE kiểm khi tạo VÀ khi xác nhận (README §2 "Điều kiện settlement", `WALLET_005`).
 *
 * `null` = chưa biết (chưa tải số dư). `0` = không trả được (tôi không nợ, hoặc người kia không
 * được nợ) — màn Trả nợ khoá nút và nói rõ, thay vì để người dùng gửi rồi nhận `WALLET_005`.
 */
export function maxSettleAmount(
  summary: Pick<WalletSummaryView, 'balances'> | undefined,
  meId: string | undefined,
  toId: string | undefined,
): number | null {
  if (!summary || !meId || !toId) return null;
  const mine = summary.balances.find((item) => item.userId === meId)?.balance ?? 0;
  const theirs = summary.balances.find((item) => item.userId === toId)?.balance ?? 0;
  return Math.max(0, Math.min(-mine, theirs));
}
