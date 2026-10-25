import { formatNumber } from '@/shared/utils/format/currency.utils';

import type { CoinTransaction } from '../api/coins.types';
import { EARN_SOURCE_LABELS, TX_TYPE_LABELS } from '../constants/coins.constants';

/**
 * Số xu LUÔN kèm chữ "xu" (app.md p7-02 §7: "1.250 xu", không chỉ icon) — dấu chấm ngăn hàng nghìn theo `formatNumber` (⛔ không `toLocaleString`).
 * `null`/`undefined` (chưa tải) ⇒ chuỗi rỗng, KHÔNG bịa "0 xu".
 */
export function formatCoins(value: number | null | undefined): string {
  return formatNumber(value, { unit: 'xu' });
}

/** Số xu có dấu tường minh cho lịch sử: `+20 xu` · `-50 xu` (xu là số nguyên nên không có ca "-0"). */
export function formatCoinDelta(amount: number): string {
  return `${amount > 0 ? '+' : ''}${formatCoins(amount)}`;
}

/**
 * Nhãn một dòng lịch sử. `EARN_EVENT` có `refId = <nguồn XP>:<id>` ⇒ nói rõ thưởng vì việc gì; nguồn lạ/thiếu ⇒ nhãn chung theo loại.
 * ⚠️ DTO cho người dùng KHÔNG có `note`/`actorId` (lý do điều chỉnh chỉ ở DTO admin) nên dòng `ADJUST_ADMIN` chỉ nói "Điều chỉnh từ quản trị viên".
 */
export function transactionLabel(tx: Pick<CoinTransaction, 'type' | 'refId'>): string {
  if (tx.type === 'EARN_EVENT') {
    const source = tx.refId.split(':')[0] ?? '';
    return EARN_SOURCE_LABELS[source] ?? TX_TYPE_LABELS.EARN_EVENT;
  }
  // `??`: BE có thể thêm loại mới sau này — hiện nhãn chung thay vì chữ "undefined".
  return TX_TYPE_LABELS[tx.type] ?? 'Giao dịch xu';
}
