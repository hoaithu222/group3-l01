/**
 * `formatMoneyBand` (p6-04 admin.md §2.1) — mã dải BE trả → nhãn hiển thị. Không
 * nhận số tiền nào nên không có đường cho số chính xác lọt vào giao diện.
 */
import { describe, expect, it } from 'vitest';

import {
  formatMoneyBand,
  MONEY_BAND_LABELS,
  type MoneyBand,
} from '@/shared/utils/format/money-band.utils';

describe('formatMoneyBand', () => {
  it.each([
    ['LT_500K', '< 500 nghìn ₫'],
    ['500K_2M', '500 nghìn – 2 triệu ₫'],
    ['2M_10M', '2 – 10 triệu ₫'],
    ['GT_10M', '> 10 triệu ₫'],
  ] as const)('%s → "%s"', (band, label) => {
    expect(formatMoneyBand(band)).toBe(label);
  });

  it('bảng nhãn đủ 4 dải, không nhãn nào chứa số tiền chính xác', () => {
    const labels = Object.values(MONEY_BAND_LABELS);
    expect(Object.keys(MONEY_BAND_LABELS)).toHaveLength(4);
    for (const label of labels) {
      expect(label).not.toMatch(/\d{1,3}(?:[.,]\d{3})+|\d{4,}/);
    }
  });

  it('mã dải lạ (BE thêm dải mới) → "—", không in mã thô', () => {
    expect(formatMoneyBand('GT_100M' as MoneyBand)).toBe('—');
  });
});
