import type { ExpenseView } from '../api';
import { formatMoney } from './money';

/**
 * Câu mô tả khoản chi cho danh sách — tách khỏi component để test được và để
 * `ExpenseRow`/màn chi tiết cùng dùng MỘT cách nói.
 */

/**
 * Số tiền của khoản chi. Khoản ĐIỀU CHỈNH có thể ÂM (giảm nợ) — nói "Giảm X" thay vì
 * dấu trừ trần (đọc màn hình đọc "trừ", và một dấu trừ dễ lẫn với dấu gạch nối).
 */
export function describeExpenseAmount(expense: Pick<ExpenseView, 'amount' | 'kind'>): string {
  if (expense.kind === 'ADJUSTMENT' && expense.amount < 0)
    return `Giảm ${formatMoney(expense.amount)}`;
  if (expense.kind === 'ADJUSTMENT' && expense.amount > 0)
    return `Tăng ${formatMoney(expense.amount)}`;
  return formatMoney(expense.amount);
}

export type MyShareTone = 'debt' | 'none' | 'paid' | 'payer';

export interface MyShareDescription {
  tone: MyShareTone;
  text: string;
}

/**
 * Phần của TÔI trong khoản chi: tôi là người trả / tôi nợ bao nhiêu / đã trả xong.
 * `null` khi tôi không tham gia khoản này (không có gì để nói).
 */
export function describeMyShare(
  expense: Pick<ExpenseView, 'myShare' | 'paidBy'>,
  meId: string | undefined,
): MyShareDescription | null {
  if (meId !== undefined && expense.paidBy === meId)
    return { tone: 'payer', text: 'Bạn đã trả khoản này' };

  const share = expense.myShare;
  if (!share || share.status === 'VOID') return null;

  if (share.status === 'PAID')
    return { tone: 'paid', text: `Bạn đã trả ${formatMoney(share.amount)}` };
  const remaining = Math.max(0, share.amount - share.paidAmount);
  if (share.status === 'PARTIAL')
    return { tone: 'debt', text: `Bạn còn nợ ${formatMoney(remaining)}` };
  return { tone: 'debt', text: `Bạn nợ ${formatMoney(share.amount)}` };
}
