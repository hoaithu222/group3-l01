import { describeTrend, historyStats, TREND_POINTS, trendOf } from '../utils/mock-history-stats';
import { makeSummaryRow } from './history-sr-fixtures';

/** Thống kê + xu hướng của lịch sử thi — chỉ tính từ các dòng ĐÃ TẢI, không suy đoán thêm. */
describe('trendOf', () => {
  it('dưới 3 điểm chưa đủ để kết luận', () => {
    expect(trendOf([])).toBeNull();
    expect(trendOf([50, 90])).toBeNull();
  });

  it('so trung bình nửa sau với nửa đầu: ≥ +5 tăng, ≤ −5 giảm, còn lại ổn định', () => {
    expect(trendOf([40, 50, 60])).toBe('up');
    expect(trendOf([80, 70, 60])).toBe('down');
    expect(trendOf([60, 62, 61])).toBe('flat');
    expect(trendOf([40, 45, 50, 60, 70, 80])).toBe('up');
    // một lượt nhích lên đơn lẻ không đủ để gọi là "tăng": xu hướng nhìn cả nửa sau, không nhìn riêng lượt cuối
    expect(trendOf([60, 60, 60, 60, 60, 66])).toBe('flat');
  });
});

describe('historyStats', () => {
  it('không có lượt nào có điểm (rỗng / chỉ lượt dở) ⇒ null', () => {
    expect(historyStats([])).toBeNull();
    expect(
      historyStats([makeSummaryRow('d', { passed: null, scorePct: null, status: 'IN_PROGRESS' })]),
    ).toBeNull();
  });

  it('một bộ: số lượt, trung bình, cao nhất, chuỗi CŨ → MỚI và xu hướng (lượt dở bị bỏ qua)', () => {
    // rows mới → cũ: 90, 70, (dở), 50
    const stats = historyStats([
      makeSummaryRow('r1', { scorePct: 90 }),
      makeSummaryRow('r2', { scorePct: 70 }),
      makeSummaryRow('rd', { passed: null, scorePct: null, status: 'IN_PROGRESS' }),
      makeSummaryRow('r3', { scorePct: 50 }),
    ]);
    expect(stats).toEqual({
      attempts: 3,
      average: 70,
      best: 90,
      series: [50, 70, 90],
      trend: 'up',
    });
  });

  it('nhiều bộ khác nhau: vẫn có thống kê chung nhưng KHÔNG có chuỗi/xu hướng (so điểm hai đề khác nhau là vô nghĩa)', () => {
    const stats = historyStats([
      makeSummaryRow('r1', { scorePct: 90 }),
      makeSummaryRow('r2', { scorePct: 40, setId: 's2' }),
    ]);
    expect(stats).toMatchObject({ attempts: 2, average: 65, best: 90, series: [], trend: null });
  });

  it(`chuỗi chỉ lấy ${String(TREND_POINTS)} lượt gần nhất`, () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      makeSummaryRow(`r${String(i)}`, { scorePct: 50 + i }),
    );
    const stats = historyStats(rows);
    expect(stats?.series).toHaveLength(TREND_POINTS);
    // rows[0] là mới nhất (điểm 50) — chuỗi kết thúc ở đó (cũ → mới).
    expect(stats?.series.at(-1)).toBe(50);
  });

  it('trung bình làm tròn; điểm lẻ của BE (66,7) giữ nguyên ở cao nhất', () => {
    const stats = historyStats([
      makeSummaryRow('r1', { scorePct: 66.7 }),
      makeSummaryRow('r2', { scorePct: 50 }),
    ]);
    expect(stats?.average).toBe(58);
    expect(stats?.best).toBe(66.7);
  });
});

describe('describeTrend', () => {
  it('câu đọc cho trình đọc màn hình nêu đủ số liệu (biểu đồ không phải nguồn duy nhất)', () => {
    const text = describeTrend({
      attempts: 3,
      average: 70,
      best: 90,
      series: [50, 70, 90],
      trend: 'up',
    });
    expect(text).toContain('3 lượt đã thi');
    expect(text).toContain('điểm trung bình 70 phần trăm');
    expect(text).toContain('cao nhất 90 phần trăm');
    expect(text).toContain('50, 70, 90');
  });

  it('không có chuỗi thì không nêu điểm các lượt gần đây', () => {
    expect(
      describeTrend({ attempts: 1, average: 70, best: 70, series: [], trend: null }),
    ).not.toContain('gần đây');
  });
});
