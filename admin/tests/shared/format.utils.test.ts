/**
 * Định dạng số / ngày.
 *
 * Vì sao có bài kiểm này: `format.utils.ts` từng import `numeral` — một gói
 * KHÔNG có trong `package.json` và chưa từng được cài. `tsc` vẫn xanh vì
 * `vite-env.d.ts` có một dòng `declare module 'numeral'` viết tay chép từ dự án
 * nguồn, và build cũng không đỏ vì lúc đó chưa file nào import tới. Gọi
 * `formatCurrency()` một phát là nổ.
 *
 * Không có test thì loại lỗi đó nằm im tới khi ra sản phẩm. Nay dùng
 * `Intl.NumberFormat` gốc của trình duyệt, và đây là bằng chứng nó chạy thật.
 */

import { describe, expect, it } from 'vitest';

import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from '@/shared/utils/format/format.utils';

/** Locale vi-VN dùng dấu chấm ngăn hàng nghìn và dấu phẩy cho phần lẻ. */
const NBSP_OR_SPACE = /\s/g;
const norm = (s: string) => s.replace(NBSP_OR_SPACE, ' ');

describe('formatCurrency', () => {
  it('VND: ngăn hàng nghìn, không phần lẻ', () => {
    expect(norm(formatCurrency(1234567))).toBe('1.234.567 ₫');
  });

  it('USD: luôn 2 chữ số lẻ', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('số âm giữ nguyên dấu', () => {
    expect(norm(formatCurrency(-1000))).toBe('-1.000 ₫');
  });

  it('NaN KHÔNG được lọt ra màn hình', () => {
    expect(norm(formatCurrency(Number.NaN))).toBe('0 ₫');
    expect(norm(formatCurrency(Number.POSITIVE_INFINITY))).toBe('0 ₫');
  });
});

describe('formatNumber', () => {
  it('mặc định không phần lẻ', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
  });

  it('làm tròn đúng số chữ số yêu cầu', () => {
    expect(formatNumber(1234.567, 2)).toBe('1.234,57');
  });

  it('NaN → 0', () => {
    expect(formatNumber(Number.NaN, 2)).toBe('0,00');
  });
});

describe('formatPercent', () => {
  it('nhận thang 100, in ra 1 chữ số lẻ', () => {
    expect(formatPercent(12.34)).toBe('12,3%');
  });

  it('0 và 100 ra đúng', () => {
    expect(formatPercent(0)).toBe('0,0%');
    expect(formatPercent(100)).toBe('100,0%');
  });
});

describe('formatDate & formatRelativeTime', () => {
  it('mặc định DD/MM/YYYY', () => {
    expect(formatDate('2026-08-31T10:00:00')).toBe('31/08/2026');
  });

  it('nhận format tuỳ ý', () => {
    expect(formatDate('2026-08-31T10:05:00', 'HH:mm')).toBe('10:05');
  });

  it('mốc thời gian tương đối theo bậc phút / giờ / ngày', () => {
    const now = Date.now();
    expect(formatRelativeTime(new Date(now - 30 * 1000))).toBe('Vừa xong');
    expect(formatRelativeTime(new Date(now - 5 * 60 * 1000))).toBe('5 phút trước');
    expect(formatRelativeTime(new Date(now - 3 * 3600 * 1000))).toBe('3 giờ trước');
    expect(formatRelativeTime(new Date(now - 2 * 86400 * 1000))).toBe('2 ngày trước');
  });
});
