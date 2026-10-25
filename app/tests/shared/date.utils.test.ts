import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatTime,
  isToday,
  toApiDate,
} from '@/shared/utils/format/date.utils';

describe('formatDate', () => {
  /**
   * ⛔ Ca quan trọng nhất: quy ước Việt Nam là NGÀY/THÁNG/NĂM.
   *
   * `2026-04-03` phải ra `03/04/2026` (3 tháng 4), KHÔNG phải `04/03/2026`.
   * Nếu ai đó "dọn dẹp" bằng cách quay về `toLocaleDateString()`, định dạng sẽ
   * đi theo ngôn ngữ máy và test này đỏ ngay.
   */
  it('theo quy ước Việt Nam dd/MM/yyyy', () => {
    expect(formatDate('2026-04-03T10:00:00')).toBe('03/04/2026');
    expect(formatDate('2026-12-25T00:00:00')).toBe('25/12/2026');
  });

  it('nhận cả Date và timestamp', () => {
    expect(formatDate(new Date(2026, 3, 3))).toBe('03/04/2026');
    expect(formatDate(new Date(2026, 3, 3).getTime())).toBe('03/04/2026');
  });

  it('rỗng/null/không hợp lệ trả về giá trị dự phòng, KHÔNG phải "Invalid Date"', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('rác')).toBe('');
    expect(formatDate(null, '—')).toBe('—');
  });
});

describe('formatDateTime / formatTime', () => {
  it('giờ 24 — quy ước Việt Nam, không SA/CH', () => {
    expect(formatDateTime('2026-04-03T14:32:00')).toBe('03/04/2026 14:32');
    expect(formatTime('2026-04-03T14:32:00')).toBe('14:32');
    expect(formatTime('2026-04-03T09:05:00')).toBe('09:05');
  });
});

describe('toApiDate', () => {
  it('trả yyyy-MM-dd cho backend', () => {
    expect(toApiDate('2026-04-03T10:00:00')).toBe('2026-04-03');
  });

  /**
   * ⛔ Bẫy MÚI GIỜ — lý do tồn tại của hàm này.
   *
   * `new Date(...).toISOString().slice(0, 10)` đổi sang UTC TRƯỚC khi cắt. Với
   * giờ Việt Nam (UTC+7), 23:30 ngày 05/04 thành `2026-04-05T16:30Z` — cắt ra
   * vẫn đúng ngày trong ví dụ này, nhưng 07:00 ngày 06/04 thành
   * `2026-04-05T00:00Z` và cắt ra LÙI MỘT NGÀY.
   *
   * Lỗi chỉ xảy ra với dữ liệu nhập sáng sớm hoặc tối muộn, nên nó lọt qua mọi
   * lần thử trong giờ hành chính rồi mới lộ khi có người tăng ca.
   */
  it('KHÔNG lệch ngày vì đổi sang UTC (bẫy toISOString)', () => {
    const lateNight = new Date(2026, 3, 5, 23, 30); // 23:30 ngày 05/04, giờ máy
    const earlyMorning = new Date(2026, 3, 6, 7, 0); // 07:00 ngày 06/04, giờ máy

    expect(toApiDate(lateNight)).toBe('2026-04-05');
    expect(toApiDate(earlyMorning)).toBe('2026-04-06');
  });

  it('rỗng trả null để không gửi chuỗi rác lên backend', () => {
    expect(toApiDate(null)).toBeNull();
    expect(toApiDate('')).toBeNull();
    expect(toApiDate('rác')).toBeNull();
  });
});

describe('formatRelative', () => {
  it('trả chuỗi tiếng Việt', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    // Không khớp cứng từng chữ (bản dịch của dayjs có thể đổi), chỉ chốt là
    // TIẾNG VIỆT chứ không rơi về "5 minutes ago".
    expect(formatRelative(fiveMinutesAgo)).toMatch(/trước/);
  });

  it('rỗng trả về giá trị dự phòng', () => {
    expect(formatRelative(null, '—')).toBe('—');
  });
});

describe('isToday', () => {
  it('phân biệt hôm nay với hôm qua', () => {
    expect(isToday(new Date())).toBe(true);
    expect(isToday(new Date(Date.now() - 24 * 60 * 60 * 1000))).toBe(false);
    expect(isToday(null)).toBe(false);
  });
});
