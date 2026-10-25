import {
  attemptDurationMs,
  describeTagScores,
  formatDurationVi,
  radarVertices,
  tagLabel,
  tagPercent,
} from '../utils/mock-result-utils';

/** Hàm thuần của màn kết quả: nhãn thẻ đặc biệt, phần trăm, câu đọc cho radar, hình học radar, thời lượng. */
describe('mock-result-utils', () => {
  it('nhãn thẻ đặc biệt của BE đọc thành tiếng Việt', () => {
    expect(tagLabel('__untagged')).toBe('Chưa gắn thẻ');
    expect(tagLabel('__other')).toBe('Khác');
    expect(tagLabel('toán')).toBe('toán');
  });

  it('tagPercent làm tròn và không chia cho 0', () => {
    expect(tagPercent({ correct: 1, total: 3 })).toBe(33);
    expect(tagPercent({ correct: 0, total: 0 })).toBe(0);
  });

  it('describeTagScores đủ số liệu cho trình đọc màn hình', () => {
    expect(describeTagScores([{ correct: 3, tag: 'lý', total: 4 }])).toBe('lý 3/4, 75 phần trăm');
  });

  it('radarVertices: trục đầu hướng LÊN, chạy theo chiều kim đồng hồ, kẹp tỉ lệ 0..1', () => {
    const [top, right, bottom, left] = radarVertices([1, 1, 1, 1], 100, 100, 50);
    expect(top).toEqual({ x: 100, y: 50 });
    expect(right?.x).toBeCloseTo(150);
    expect(bottom?.y).toBeCloseTo(150);
    expect(left?.x).toBeCloseTo(50);
    const clamped = radarVertices([2], 0, 0, 10)[0]; // > 1 bị kẹp về 1
    expect(clamped?.x).toBeCloseTo(0);
    expect(clamped?.y).toBeCloseTo(-10);
    expect(radarVertices([-1, 0], 0, 0, 10)[0]?.y).toBeCloseTo(0);
  });

  it.each([
    [0, '0 giây'],
    [48_000, '48 giây'],
    [125_000, '2 phút 5 giây'],
    [120_000, '2 phút'],
    [3_720_000, '1 giờ 2 phút'],
  ])('formatDurationVi(%i) = %s', (ms, expected) => {
    expect(formatDurationVi(ms)).toBe(expected);
  });

  it('attemptDurationMs = nộp − bắt đầu; chưa nộp hoặc mốc ngược ⇒ null', () => {
    expect(
      attemptDurationMs({
        startedAt: '2026-09-25T10:00:00.000Z',
        submittedAt: '2026-09-25T10:12:30.000Z',
      }),
    ).toBe(750_000);
    expect(
      attemptDurationMs({ startedAt: '2026-09-25T10:00:00.000Z', submittedAt: null }),
    ).toBeNull();
    expect(
      attemptDurationMs({
        startedAt: '2026-09-25T10:00:00.000Z',
        submittedAt: '2026-09-25T09:00:00.000Z',
      }),
    ).toBeNull();
  });
});
