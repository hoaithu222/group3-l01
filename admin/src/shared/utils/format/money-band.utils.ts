/**
 * @file money-band.utils.ts
 * @description Nhãn DẢI GIÁ TRỊ tiền — nơi admin chỉ được biết độ lớn, KHÔNG được
 *   biết số chính xác (vd tổng chi 30 ngày của ví nhóm, p6-04 admin.md §2.1).
 *
 * Khác `money.utils.ts` (định dạng một SỐ cụ thể): file này không nhận số tiền
 * nào cả. BE đã gộp sẵn thành mã dải, client chỉ dịch mã ra nhãn — nên không có
 * đường nào để số chính xác lọt vào giao diện.
 */

/**
 * Mã dải do BE trả (`WalletStatsView.last30d.spendBand`). Thứ tự khai báo là thứ
 * tự tăng dần của độ lớn.
 */
export type MoneyBand = 'LT_500K' | '500K_2M' | '2M_10M' | 'GT_10M';

export const MONEY_BAND_LABELS: Readonly<Record<MoneyBand, string>> = {
  LT_500K: '< 500 nghìn ₫',
  '500K_2M': '500 nghìn – 2 triệu ₫',
  '2M_10M': '2 – 10 triệu ₫',
  GT_10M: '> 10 triệu ₫',
};

/**
 * Mã dải → nhãn hiển thị. Mã lạ (BE thêm dải mới mà client chưa cập nhật) rơi về
 * `—` thay vì in thẳng mã thô ra giao diện.
 */
export function formatMoneyBand(band: MoneyBand): string {
  return (MONEY_BAND_LABELS as Readonly<Record<string, string | undefined>>)[band] ?? '—';
}
