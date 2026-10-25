import {
  countUpValue,
  formatScore,
  scoreBreakdown,
  scoreVerdict,
  tagStrength,
  weakTags,
} from '../utils/mock-score-utils';

/** Logic thuần của màn kết quả thi thử: định dạng điểm, nhận xét theo mức, phân rã đúng/sai/bỏ trống, chủ đề yếu, số chạy lên. */
describe('formatScore', () => {
  it('số nguyên không có phần thập phân; số lẻ dùng dấu PHẨY kiểu Việt', () => {
    expect(formatScore(67)).toBe('67');
    expect(formatScore(100)).toBe('100');
    expect(formatScore(66.7)).toBe('66,7');
    expect(formatScore(0)).toBe('0');
  });

  it('không làm tròn lên ngưỡng đạt: 49,6 vẫn là 49,6 (không hiện thành 50 cạnh "Chưa đạt")', () => {
    expect(formatScore(49.6)).toBe('49,6');
  });
});

describe('scoreVerdict', () => {
  it('đạt: chia bốn mức theo điểm', () => {
    expect(scoreVerdict(100, 50, true).tier).toBe('perfect');
    expect(scoreVerdict(95, 50, true).tier).toBe('excellent');
    expect(scoreVerdict(90, 50, true).tier).toBe('excellent');
    expect(scoreVerdict(80, 50, true).tier).toBe('good');
    expect(scoreVerdict(75, 50, true).tier).toBe('good');
    expect(scoreVerdict(60, 50, true).tier).toBe('pass');
  });

  it('chưa đạt: sát ngưỡng (kém tối đa 10 điểm) khác hẳn "cần ôn thêm"', () => {
    expect(scoreVerdict(45, 50, false).tier).toBe('near');
    expect(scoreVerdict(40, 50, false).tier).toBe('near');
    expect(scoreVerdict(39, 50, false).tier).toBe('low');
    expect(scoreVerdict(0, 50, false).tier).toBe('low');
  });

  it('Đạt/Chưa đạt theo `passed` của server, không tự so điểm với ngưỡng', () => {
    // server đã chốt "chưa đạt" bằng số chưa làm tròn — nhận xét không được nói ngược lại.
    expect(scoreVerdict(50, 50, false).tier).toBe('near');
    expect(scoreVerdict(50, 50, true).tier).toBe('pass');
  });

  it('mỗi mức có câu khen/gợi ý không rỗng', () => {
    for (const [pct, passed] of [
      [100, true],
      [92, true],
      [80, true],
      [55, true],
      [48, false],
      [10, false],
    ] as const) {
      const verdict = scoreVerdict(pct, 50, passed);
      expect(verdict.headline.length).toBeGreaterThan(0);
      expect(verdict.message.length).toBeGreaterThan(0);
    }
  });
});

describe('scoreBreakdown', () => {
  it('đúng + sai + bỏ trống luôn cộng đúng tổng số câu', () => {
    expect(scoreBreakdown({ answeredCount: 8, correctCount: 5, total: 10 })).toEqual({
      correct: 5,
      unanswered: 2,
      wrong: 3,
    });
  });

  it('dữ liệu lệch (đáp án nộp trễ bị bỏ qua) vẫn không ra số âm và vẫn cộng đúng tổng', () => {
    const b = scoreBreakdown({ answeredCount: 0, correctCount: 1, total: 2 });
    expect(b.correct + b.wrong + b.unanswered).toBe(2);
    expect(b.wrong).toBeGreaterThanOrEqual(0);
    const over = scoreBreakdown({ answeredCount: 99, correctCount: 99, total: 4 });
    expect(over).toEqual({ correct: 4, unanswered: 0, wrong: 0 });
  });

  it('chưa có điểm (`correctCount` null) coi như 0 đúng', () => {
    expect(scoreBreakdown({ answeredCount: 3, correctCount: null, total: 5 })).toEqual({
      correct: 0,
      unanswered: 2,
      wrong: 3,
    });
  });
});

describe('chủ đề yếu', () => {
  it('tagStrength: vững ≥ 80, vừa 60–79, yếu < 60', () => {
    expect(tagStrength(100)).toBe('strong');
    expect(tagStrength(80)).toBe('strong');
    expect(tagStrength(79)).toBe('medium');
    expect(tagStrength(60)).toBe('medium');
    expect(tagStrength(59)).toBe('weak');
  });

  it('weakTags: chỉ chủ đề dưới 60%, điểm thấp trước, tối đa 3, không sửa mảng gốc', () => {
    const scores = [
      { correct: 3, tag: 'a', total: 4 },
      { correct: 1, tag: 'b', total: 4 },
      { correct: 0, tag: 'c', total: 2 },
      { correct: 2, tag: 'd', total: 5 },
      { correct: 1, tag: 'e', total: 3 },
      { correct: 0, tag: 'f', total: 0 },
    ];
    const snapshot = scores.map((s) => s.tag);
    expect(weakTags(scores).map((s) => s.tag)).toEqual(['c', 'b', 'e']);
    expect(weakTags(scores, 1).map((s) => s.tag)).toEqual(['c']);
    expect(scores.map((s) => s.tag)).toEqual(snapshot);
  });

  it('weakTags: không có chủ đề yếu ⇒ mảng rỗng; chủ đề 0 câu không bao giờ là "yếu"', () => {
    expect(weakTags([{ correct: 4, tag: 'a', total: 4 }])).toEqual([]);
    expect(weakTags([{ correct: 0, tag: 'z', total: 0 }])).toEqual([]);
  });
});

describe('countUpValue', () => {
  it('bắt đầu ở 0, kết thúc ĐÚNG số đích (kể cả số lẻ), tăng đơn điệu', () => {
    expect(countUpValue(0, 66.7)).toBe(0);
    expect(countUpValue(1, 66.7)).toBe(66.7);
    expect(countUpValue(2, 66.7)).toBe(66.7);
    let previous = -1;
    for (let t = 0; t <= 1; t += 0.1) {
      const value = countUpValue(t, 80);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('ease-out: nửa thời gian đã đi quá nửa quãng (nhanh trước, chậm sau)', () => {
    expect(countUpValue(0.5, 100)).toBeGreaterThan(50);
  });
});
