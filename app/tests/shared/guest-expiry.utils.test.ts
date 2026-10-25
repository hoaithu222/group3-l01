import {
  formatGuestExpiryDate,
  formatGuestRemaining,
  getGuestRemaining,
  GUEST_EXPIRING_HOURS,
} from '@/shared/utils/format/guest-expiry.utils';

const NOW = new Date('2026-09-19T10:00:00.000Z').getTime();
const HOUR = 60 * 60 * 1000;

describe('getGuestRemaining', () => {
  it('không có hạn / hạn hỏng → null (nơi gọi ẩn hẳn phần hiển thị)', () => {
    expect(getGuestRemaining(null, NOW)).toBeNull();
    expect(getGuestRemaining(undefined, NOW)).toBeNull();
    expect(getGuestRemaining('', NOW)).toBeNull();
    expect(getGuestRemaining('không-phải-ngày', NOW)).toBeNull();
  });

  it('còn 12 ngày → "còn 12 ngày", chưa khẩn', () => {
    const result = getGuestRemaining(new Date(NOW + 12 * 24 * HOUR).toISOString(), NOW);

    expect(result).toMatchObject({ expired: false, urgent: false, days: 12 });
    expect(formatGuestRemaining(result!)).toBe('còn 12 ngày');
  });

  it('làm tròn LÊN: còn 11,2 ngày vẫn là "còn 12 ngày", không phải 11', () => {
    const result = getGuestRemaining(new Date(NOW + 11.2 * 24 * HOUR).toISOString(), NOW);

    expect(result?.days).toBe(12);
  });

  it(`đúng ngưỡng ${GUEST_EXPIRING_HOURS} giờ → khẩn, đổi sang đơn vị giờ`, () => {
    const result = getGuestRemaining(new Date(NOW + GUEST_EXPIRING_HOURS * HOUR).toISOString(), NOW);

    expect(result).toMatchObject({ expired: false, urgent: true, hours: GUEST_EXPIRING_HOURS });
    expect(formatGuestRemaining(result!)).toBe('còn 48 giờ');
  });

  it('còn vài phút → "còn 1 giờ", KHÔNG phải "còn 0 giờ"', () => {
    const result = getGuestRemaining(new Date(NOW + 5 * 60 * 1000).toISOString(), NOW);

    expect(result?.hours).toBe(1);
    expect(formatGuestRemaining(result!)).toBe('còn 1 giờ');
  });

  it('đã qua hạn (kể cả đúng hạn) → expired + khẩn — không chờ job dọn phía BE', () => {
    for (const offset of [-HOUR, 0]) {
      const result = getGuestRemaining(new Date(NOW + offset).toISOString(), NOW);

      expect(result).toMatchObject({ expired: true, urgent: true });
      expect(formatGuestRemaining(result!)).toBe('đã hết hạn');
    }
  });
});

describe('formatGuestExpiryDate', () => {
  it('ngày cụ thể theo dd/MM/yyyy (quy ước Việt Nam)', () => {
    expect(formatGuestExpiryDate('2026-10-03T08:00:00')).toBe('hết hạn 03/10/2026');
  });

  it('không có hạn → chuỗi rỗng', () => {
    expect(formatGuestExpiryDate(null)).toBe('');
  });
});
