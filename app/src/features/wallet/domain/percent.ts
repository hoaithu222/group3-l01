import { WALLET_LIMITS } from '../constants/wallet.constants';

/**
 * Phần trăm ↔ basis points (1% = 100 bps). BE lưu `bps` nguyên để tránh số thực;
 * người dùng gõ phần trăm tối đa 2 chữ số thập phân ("33,33" → 3333).
 */

/** `3333` → `"33,33"` · `5000` → `"50"` · `3350` → `"33,5"` (dấu phẩy thập phân theo quy ước VN). */
export function bpsToPercentText(bps: number | null): string {
  if (bps === null) return '';
  const whole = Math.floor(bps / 100);
  const fraction = String(bps % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole},${fraction}` : String(whole);
}

/**
 * Chuỗi gõ → bps, hoặc `null` khi trống. Nhận cả `,` lẫn `.` làm dấu thập phân
 * (bàn phím số của Android chỉ cho một trong hai tuỳ máy), bỏ ký tự lạ, cắt còn 2
 * chữ số thập phân, và chặn trần 100%.
 */
export function percentTextToBps(text: string): number | null {
  const cleaned = text.replace(/[^\d.,]/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '.') return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  const bps =
    Number.parseInt(whole || '0', 10) * 100 +
    Number.parseInt(fraction.slice(0, 2).padEnd(2, '0'), 10);
  return Math.min(bps, WALLET_LIMITS.bpsTotal);
}
