import {
  deviceTimeZone,
  formatDateInZone,
  formatDateSeparator,
  formatDuration,
  formatTimeInZone,
  isSameZonedDay,
  toZoned,
  zonedDayDiff,
} from '@/shared/utils/datetime';

/**
 * Ngày giờ theo múi giờ (p0-12, SHL-09). Hai múi giờ trong test: `Asia/Ho_Chi_Minh` (UTC+7, không DST) và
 * `America/Los_Angeles` (UTC−7 vào tháng 9) — cùng MỘT thời điểm phải rơi vào hai ngày lịch khác nhau quanh nửa đêm.
 */

const HCM = 'Asia/Ho_Chi_Minh';
const LA = 'America/Los_Angeles';

// 23:59 và 00:01 giờ Việt Nam quanh nửa đêm 26 → 27/09/2026 (cách nhau 2 phút).
const HCM_2359 = '2026-09-26T16:59:00Z';
const HCM_0001 = '2026-09-26T17:01:00Z';
// 08:00 sáng 27/09 giờ Việt Nam (= 18:00 ngày 26/09 ở Los Angeles).
const NOW = '2026-09-27T01:00:00Z';

describe('toZoned', () => {
  it('quy đổi cùng thời điểm sang đồng hồ treo tường của từng múi giờ', () => {
    expect(toZoned(HCM_2359, HCM)).toMatchObject({
      day: 26,
      hour: 23,
      minute: 59,
      month: 9,
      year: 2026,
    });
    expect(toZoned(HCM_2359, LA)).toMatchObject({
      day: 26,
      hour: 9,
      minute: 59,
      month: 9,
      year: 2026,
    });
  });

  it('nửa đêm là giờ 0 (không phải 24) và thứ trong tuần đúng', () => {
    // 2026-09-26T17:00Z = 00:00 ngày 27/09 giờ Việt Nam; 27/09/2026 là Chủ Nhật.
    expect(toZoned('2026-09-26T17:00:00Z', HCM)).toMatchObject({ day: 27, hour: 0, weekday: 0 });
  });

  it('không có múi giờ ⇒ giờ thiết bị; múi giờ lạ ⇒ rơi về thiết bị, KHÔNG ném', () => {
    const device = toZoned(HCM_2359);
    expect(toZoned(HCM_2359, 'Khong/Ton_Tai')).toEqual(device);
    expect(typeof deviceTimeZone()).toMatch(/string|undefined/);
  });

  it('đầu vào không hợp lệ ⇒ null', () => {
    expect(toZoned('không phải ngày', HCM)).toBeNull();
    expect(toZoned(Number.NaN, HCM)).toBeNull();
  });

  it('nhận Date, số (ms) và chuỗi ISO cho cùng kết quả', () => {
    const iso = '2026-01-02T03:04:05Z';
    expect(toZoned(new Date(iso), HCM)).toEqual(toZoned(Date.parse(iso), HCM));
    expect(toZoned(iso, HCM)).toEqual(toZoned(Date.parse(iso), HCM));
  });
});

describe('zonedDayDiff / isSameZonedDay', () => {
  it('cách nhau 2 phút mà khác ngày lịch ở Việt Nam, cùng ngày ở Los Angeles', () => {
    expect(zonedDayDiff(HCM_0001, HCM_2359, HCM)).toBe(1);
    expect(isSameZonedDay(HCM_0001, HCM_2359, HCM)).toBe(false);
    expect(zonedDayDiff(HCM_0001, HCM_2359, LA)).toBe(0);
    expect(isSameZonedDay(HCM_0001, HCM_2359, LA)).toBe(true);
  });

  it('ngày không hợp lệ ⇒ null / false', () => {
    expect(zonedDayDiff('x', HCM_2359, HCM)).toBeNull();
    expect(isSameZonedDay('x', HCM_2359, HCM)).toBe(false);
  });
});

describe('formatDateSeparator (SHL-09)', () => {
  it('23:59 hôm trước = "Hôm qua", 00:01 hôm nay = "Hôm nay" — theo múi giờ Việt Nam', () => {
    expect(formatDateSeparator(HCM_2359, { now: NOW, timeZone: HCM })).toBe('Hôm qua');
    expect(formatDateSeparator(HCM_0001, { now: NOW, timeZone: HCM })).toBe('Hôm nay');
  });

  it('cùng hai thời điểm đó ở Los Angeles đều là "Hôm nay"', () => {
    expect(formatDateSeparator(HCM_2359, { now: NOW, timeZone: LA })).toBe('Hôm nay');
    expect(formatDateSeparator(HCM_0001, { now: NOW, timeZone: LA })).toBe('Hôm nay');
  });

  it('cũ hơn hôm qua, cùng năm ⇒ "Thứ Hai, 14/09"', () => {
    const now = '2026-09-26T05:00:00Z';
    // 14/09/2026 giờ Việt Nam là Thứ Hai.
    expect(formatDateSeparator('2026-09-14T03:00:00Z', { now, timeZone: HCM })).toBe(
      'Thứ Hai, 14/09',
    );
    expect(formatDateSeparator('2026-09-20T03:00:00Z', { now, timeZone: HCM })).toBe(
      'Chủ Nhật, 20/09',
    );
  });

  it('khác năm ⇒ dd/MM/yyyy', () => {
    expect(formatDateSeparator('2025-12-31T03:00:00Z', { now: NOW, timeZone: HCM })).toBe(
      '31/12/2025',
    );
  });

  it('ngày không hợp lệ ⇒ chuỗi rỗng', () => {
    expect(formatDateSeparator('x', { now: NOW, timeZone: HCM })).toBe('');
  });
});

describe('formatTimeInZone / formatDateInZone', () => {
  it('giờ 24h và ngày dd/MM/yyyy theo múi giờ', () => {
    expect(formatTimeInZone(HCM_2359, { timeZone: HCM })).toBe('23:59');
    expect(formatTimeInZone(HCM_2359, { timeZone: LA })).toBe('09:59');
    expect(formatDateInZone(HCM_0001, { timeZone: HCM })).toBe('27/09/2026');
    expect(formatDateInZone(HCM_0001, { timeZone: LA })).toBe('26/09/2026');
  });

  it('không hợp lệ ⇒ chuỗi rỗng', () => {
    expect(formatTimeInZone('x')).toBe('');
    expect(formatDateInZone('x')).toBe('');
  });
});

describe('formatDuration', () => {
  it.each([
    [3725, '1:02:05'],
    [65, '1:05'],
    [5, '0:05'],
    [0, '0:00'],
    [3600, '1:00:00'],
    [59.9, '0:59'],
    [86_399, '23:59:59'],
  ])('%d giây → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it('số âm / NaN / vô cực ⇒ "0:00" (không bao giờ "NaN:NaN")', () => {
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});
