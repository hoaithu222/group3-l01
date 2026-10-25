import { formatCurrency, formatNumber } from '@/shared/utils/format/currency.utils';

import { WALLET_LIMITS } from '../constants/wallet.constants';

/**
 * Nhập/hiển thị TIỀN. Số tiền luôn là số nguyên đồng — không có phần thập phân
 * ở bất kỳ đâu trong feature này.
 */

/** Trần số chữ số giữ lại: 15 chữ số vẫn an toàn với `Number` (2^53 ≈ 9.0e15). */
const MAX_DIGITS = 15;

/**
 * Chuỗi người dùng gõ → số nguyên đồng, hoặc `null` khi ô trống.
 *
 * ⚠️ Lọc MỌI ký tự không phải chữ số, không chỉ dấu chấm: bàn phím số của Android
 * vẫn có dấu phẩy/trừ, và dán từ ghi chú có thể mang theo "đ", "VND", khoảng trắng.
 * Chặn trần (`max`) ở ĐÂY chứ không để form báo lỗi sau — gõ thêm chữ số thứ chín
 * thì số giữ nguyên ở trần thay vì nhảy thành số khác khó hiểu.
 */
export function parseMoneyInput(
  text: string,
  max: number = WALLET_LIMITS.expenseMax,
): number | null {
  const digits = text.replace(/\D/g, '').slice(0, MAX_DIGITS);
  if (digits === '') return null;
  return Math.min(Number.parseInt(digits, 10), max);
}

/** Số → chuỗi ô nhập (`1234567` → `1.234.567`); `null` → ô trống. */
export function formatMoneyInput(value: number | null): string {
  return value === null ? '' : formatNumber(value);
}

/** Tiền dương, `37.500 VND`. Số ÂM hiển thị bằng chữ ở nơi gọi (xem `describeBalance`), không dấu trừ. */
export function formatMoney(amount: number): string {
  return formatCurrency(Math.abs(amount), { fallback: '—' });
}

export type BalanceTone = 'credit' | 'debt' | 'even';

export interface BalanceDescription {
  tone: BalanceTone;
  /** Câu đầy đủ cho tiêu đề ("Bạn đang nợ 37.500 VND"). */
  headline: string;
  /** Cụm ngắn cho dòng thành viên ("nợ 37.500 VND"). */
  short: string;
}

/**
 * Số dư ròng → chữ. `> 0` được nợ · `< 0` đang nợ.
 *
 * ⛔ Không dùng dấu trừ trần và không để MÀU là dấu hiệu duy nhất (`mobile-ux.md`,
 * trợ năng): "-37.500 VND" đọc lên thành "trừ", còn người mù màu thì không phân
 * biệt nổi xanh/đỏ. Chữ "nợ"/"được nợ" đi kèm icon ở nơi hiển thị.
 */
export function describeBalance(
  balance: number,
  subject: 'me' | 'other' = 'me',
): BalanceDescription {
  const amount = formatMoney(balance);
  if (balance === 0) {
    return {
      tone: 'even',
      headline: subject === 'me' ? 'Đã thanh toán hết' : 'Không nợ ai',
      short: 'không nợ',
    };
  }
  const who = subject === 'me' ? 'Bạn' : '';
  return balance < 0
    ? { tone: 'debt', headline: `${who} đang nợ ${amount}`.trim(), short: `nợ ${amount}` }
    : { tone: 'credit', headline: `${who} được nợ ${amount}`.trim(), short: `được nợ ${amount}` };
}
