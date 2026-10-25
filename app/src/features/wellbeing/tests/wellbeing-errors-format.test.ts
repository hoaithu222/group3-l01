import {
  isFeatureOff,
  isGone,
  isNotEnabled,
  wellbeingErrorMessage,
} from '../utils/wellbeing-errors';
import {
  addDays,
  formatDayMonth,
  formatMinutes,
  weekdayLong,
  weekdayShort,
} from '../utils/wellbeing-format';
import { apiError, networkError } from './wellbeing.harness';

/** Câu lỗi `WELL_*`/`CFG_005` và định dạng phút/ngày — nói SAI là người dùng đọc sai về chính sức khoẻ của mình. */
describe('câu lỗi WELL_* / CFG_005', () => {
  it('mã của feature có câu riêng, không dùng câu của server', () => {
    expect(wellbeingErrorMessage(apiError(409, 'WELL_001'))).toBe(
      'Bạn chưa bật theo dõi sức khoẻ học tập',
    );
    expect(wellbeingErrorMessage(apiError(400, 'WELL_003'))).toContain('Chưa thực hiện được');
    expect(wellbeingErrorMessage(apiError(400, 'WELL_004'))).toContain('Chưa thực hiện được');
    expect(wellbeingErrorMessage(apiError(404, 'CFG_005'))).toBe(
      'Tính năng này hiện chưa khả dụng',
    );
  });

  it('phân loại: chưa bật · cờ tắt · không còn (404 không phải do cờ)', () => {
    expect(isNotEnabled(apiError(409, 'WELL_001'))).toBe(true);
    expect(isNotEnabled(new Error('WELL_001'))).toBe(false); // chỉ dựa vào MÃ của BE, không đoán theo chữ
    expect(isNotEnabled(apiError(500, 'SYS_001'))).toBe(false);
    expect(isFeatureOff(apiError(404, 'CFG_005'))).toBe(true);
    expect(isGone(apiError(404, 'RES_001'))).toBe(true);
    expect(isGone(apiError(404, 'CFG_005'))).toBe(false);
  });

  it('mất mạng ⇒ câu chung của app (không ném)', () => {
    expect(wellbeingErrorMessage(networkError()).length).toBeGreaterThan(5);
  });
});

describe('định dạng phút/ngày', () => {
  it('phút → "giờ phút" tiếng Việt; không hợp lệ ⇒ 0 phút (không bao giờ "NaN")', () => {
    expect(formatMinutes(195)).toBe('3 giờ 15 phút');
    expect(formatMinutes(60)).toBe('1 giờ');
    expect(formatMinutes(45)).toBe('45 phút');
    expect(formatMinutes(0)).toBe('0 phút');
    expect(formatMinutes(-5)).toBe('0 phút');
    expect(formatMinutes(Number.NaN)).toBe('0 phút');
  });

  it('ngày lịch không lệch múi giờ: ngày/tháng, thứ, cộng ngày qua ranh giới tháng/năm', () => {
    expect(formatDayMonth('2026-09-07')).toBe('07/09');
    expect(formatDayMonth('hỏng')).toBe('hỏng');
    expect(weekdayShort('2026-09-28')).toBe('T2'); // 28/09/2026 là thứ Hai
    expect(weekdayLong('2026-09-27')).toBe('Chủ nhật');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
  });
});
