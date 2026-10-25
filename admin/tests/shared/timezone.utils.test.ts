/**
 * Múi giờ — giờ trong ngày theo múi giờ CỦA SỰ KIỆN (không phải của máy).
 *
 * `tab Cuộc họp` của workspace từng tự gọi `Intl.DateTimeFormat` trong file tiện ích của feature; nay đi qua
 * `@/shared/utils/format` như mọi định dạng khác. Các mốc dưới đây chọn theo giờ UTC nên kết quả không phụ thuộc
 * múi giờ của máy chạy test.
 */
import { describe, expect, it } from 'vitest';

import { formatTimeInZone, getBrowserTimeZone, isValidTimeZone } from '@/shared/utils/format';

describe('formatTimeInZone', () => {
  const AT = '2026-10-05T02:00:00.000Z';

  it('in HH:mm theo múi giờ chỉ định', () => {
    expect(formatTimeInZone(AT, 'UTC')).toBe('02:00');
    expect(formatTimeInZone(AT, 'Asia/Tokyo')).toBe('11:00'); // UTC+9
    expect(formatTimeInZone(AT, 'Asia/Ho_Chi_Minh')).toBe('09:00'); // UTC+7
  });

  it('hiểu giờ mùa hè: 02:00 UTC ngày 5/10/2026 ở New York (EDT, UTC−4) là 22:00 hôm trước', () => {
    expect(formatTimeInZone(AT, 'America/New_York')).toBe('22:00');
  });

  it('nửa đêm là "00:xx", không phải "24:xx" (hourCycle h23)', () => {
    expect(formatTimeInZone('2026-10-05T00:05:00.000Z', 'UTC')).toBe('00:05');
    expect(formatTimeInZone('2026-10-04T17:05:00.000Z', 'Asia/Ho_Chi_Minh')).toBe('00:05');
  });

  it('nhận Date và timestamp như chuỗi ISO', () => {
    expect(formatTimeInZone(new Date(AT), 'UTC')).toBe('02:00');
    expect(formatTimeInZone(Date.parse(AT), 'UTC')).toBe('02:00');
  });

  it('gọi lại cùng múi giờ vẫn đúng (bộ định dạng được nhớ, không lệch trạng thái)', () => {
    expect(formatTimeInZone(AT, 'Asia/Tokyo')).toBe('11:00');
    expect(formatTimeInZone('2026-10-05T05:30:00.000Z', 'Asia/Tokyo')).toBe('14:30');
  });
});

describe('isValidTimeZone', () => {
  it('nhận tên IANA thật', () => {
    expect(isValidTimeZone('Asia/Ho_Chi_Minh')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('từ chối chuỗi hỏng / rỗng thay vì ném lỗi', () => {
    expect(isValidTimeZone('Khong/Hop-Le')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('GMT+7')).toBe(false);
  });
});

describe('getBrowserTimeZone', () => {
  it('trả múi giờ IANA của môi trường chạy', () => {
    const tz = getBrowserTimeZone();
    expect(tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(isValidTimeZone(tz)).toBe(true);
  });
});
