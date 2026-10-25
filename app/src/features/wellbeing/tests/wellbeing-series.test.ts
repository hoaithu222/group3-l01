import { factorSentence } from '../utils/factor-text';
import {
  buildSeries,
  chartCeiling,
  daysWithData,
  seriesEnd,
  wellbeingToday,
} from '../utils/wellbeing-series';
import { daily, factor } from './wellbeing.harness';

/** Chuỗi ngày cho biểu đồ (ngày wellbeing, ngày thiếu ≠ 0) và câu dịu cho nhân tố (không điểm, không ngưỡng). */
describe('chuỗi ngày cho biểu đồ', () => {
  const now = new Date(2026, 8, 27, 12, 0); // hôm nay 27/09 (giờ máy)

  it('ngày wellbeing bắt đầu 05:00: 02:00 sáng vẫn thuộc ngày hôm trước', () => {
    expect(wellbeingToday(new Date(2026, 8, 27, 2, 0))).toBe('2026-09-26');
    expect(wellbeingToday(new Date(2026, 8, 27, 5, 0))).toBe('2026-09-27');
    expect(wellbeingToday(new Date(2026, 8, 27, 23, 30))).toBe('2026-09-27');
  });

  it('cột cuối = hôm qua, đủ `days` ô cũ → mới; ngày thiếu là null chứ không phải 0', () => {
    const slots = buildSeries(
      [daily('2026-09-26'), daily('2026-09-24', { activeMinutes: 90 })],
      7,
      now,
    );

    expect(slots).toHaveLength(7);
    expect(slots[0]?.date).toBe('2026-09-20');
    expect(slots[6]?.date).toBe('2026-09-26');
    expect(slots[6]?.daily?.activeMinutes).toBe(200);
    expect(slots[5]?.daily).toBeNull();
    expect(slots[4]?.daily?.activeMinutes).toBe(90);
    expect(daysWithData(slots)).toBe(2);
  });

  it('có ngày dữ liệu mới hơn (lệch múi giờ) ⇒ lấy ngày đó làm cột cuối, không cắt mất số liệu', () => {
    expect(seriesEnd([daily('2026-09-28')], now)).toBe('2026-09-28');
    expect(buildSeries([daily('2026-09-28')], 7, now).at(-1)?.daily).not.toBeNull();
  });

  it('dòng ngoài cửa sổ bị bỏ; trần thang ≥ 1 kể cả khi chưa có số liệu (không chia cho 0)', () => {
    const slots = buildSeries([daily('2026-08-01')], 7, now);
    expect(daysWithData(slots)).toBe(0);
    expect(chartCeiling(slots)).toBe(1);
  });

  it('30 ngày ⇒ 30 ô liên tiếp không trùng ngày', () => {
    const slots = buildSeries([], 30, now);
    expect(slots).toHaveLength(30);
    expect(new Set(slots.map((slot) => slot.date)).size).toBe(30);
  });
});

describe('câu dịu cho nhân tố', () => {
  it('nêu sự việc kèm con số của người dùng, KHÔNG nêu điểm/ngưỡng/phán xét', () => {
    const sentence = factorSentence(factor({ value: 195 }));
    expect(sentence).toBe(
      'Có buổi bạn làm việc liên tục khoảng 3 giờ 15 phút trong 7 ngày gần đây',
    );
    expect(sentence).not.toMatch(/điểm|ngưỡng|nguy|kiệt|quá lâu/i);
  });

  it('chuỗi ngày liên tiếp: value là SỐ NGÀY, không phải phút', () => {
    const streak = factor({
      aggregate: 'CONSECUTIVE_DAYS_OVER',
      metric: 'lateNightMinutes',
      value: 3,
    });
    expect(factorSentence(streak)).toBe('Bạn hoạt động vào khuya 3 ngày liên tiếp');
  });

  it('tổ hợp chưa biết ⇒ nhãn của luật; nhãn rỗng ⇒ câu chung (không bao giờ trống)', () => {
    expect(factorSentence(factor({ aggregate: 'SUM', label: 'Nhãn dự phòng' }))).toBe(
      'Nhãn dự phòng',
    );
    expect(factorSentence(factor({ aggregate: 'SUM', label: '  ' }))).toBe(
      'Nhịp làm việc gần đây của bạn khá dày',
    );
  });
});
