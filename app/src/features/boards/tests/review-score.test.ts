import {
  formatCriterionScore,
  formatScore,
  previewScore,
  round1,
  scorePayload,
  scoreProblems,
  type ScoreDraft,
} from '../utils/review-score';
import { RUBRIC_4_3_3 } from './review-fixtures';

/** p4-05 app.md §8 "Jest thuần": cùng công thức BE `round1(Σ điểm / Σ tối đa × 10)`, bước 0,5, không rubric nhập thẳng 0–10. */

const scored = (a: number | null, b: number | null, c: number | null): ScoreDraft => ({
  free: null,
  scores: { r_aaaaaa: a, r_bbbbbb: b, r_cccccc: c },
});

describe('review-score — có rubric', () => {
  it('PM2-31: rubric 4 + 3 + 3 chấm 3 + 3 + 2 → "8,0"', () => {
    const preview = previewScore(RUBRIC_4_3_3, scored(3, 3, 2));
    expect(preview).toEqual({ filled: 3, score10: 8, total: 3 });
    expect(formatScore(preview.score10 as number)).toBe('8,0');
  });

  it('làm tròn 1 chữ số, nửa lên: 3,5 + 2,5 + 1 trên 10 → 7,0; 1 trên 3 → 3,3; 2 trên 3 → 6,7', () => {
    expect(previewScore(RUBRIC_4_3_3, scored(3.5, 2.5, 1)).score10).toBe(7);
    expect(round1((1 / 3) * 10)).toBe(3.3);
    expect(round1((2 / 3) * 10)).toBe(6.7);
    expect(round1(8.25)).toBe(8.3);
  });

  it('còn ô thiếu/sai → chưa có tổng; lỗi đúng từng ô: thiếu · ngoài khoảng · lệch bước 0,5', () => {
    const draft = scored(null, 3.5, 1.2);
    expect(scoreProblems(RUBRIC_4_3_3, draft)).toEqual({
      r_aaaaaa: 'MISSING',
      r_bbbbbb: 'OUT_OF_RANGE',
      r_cccccc: 'INVALID_STEP',
    });
    expect(previewScore(RUBRIC_4_3_3, draft)).toEqual({ filled: 0, score10: null, total: 3 });
    expect(previewScore(RUBRIC_4_3_3, scored(4, null, 3)).filled).toBe(2);
  });

  it('điểm 0 là điểm THẬT (khác chưa chấm)', () => {
    expect(scoreProblems(RUBRIC_4_3_3, scored(0, 0, 0))).toEqual({});
    expect(previewScore(RUBRIC_4_3_3, scored(0, 0, 0)).score10).toBe(0);
  });

  it('payload gửi điểm theo tiêu chí, KHÔNG gửi score10', () => {
    expect(scorePayload(RUBRIC_4_3_3, scored(3, 3, 2))).toEqual({
      rubricScores: [
        { criterionId: 'r_aaaaaa', score: 3 },
        { criterionId: 'r_bbbbbb', score: 3 },
        { criterionId: 'r_cccccc', score: 2 },
      ],
    });
  });
});

describe('review-score — không rubric (điểm chung 0–10)', () => {
  const free = (value: number | null): ScoreDraft => ({ free: value, scores: {} });

  it('nhập thẳng score10 bước 0,5; payload chỉ có score10', () => {
    expect(previewScore([], free(7.5))).toEqual({ filled: 1, score10: 7.5, total: 1 });
    expect(scorePayload([], free(7.5))).toEqual({ rubricScores: [], score10: 7.5 });
  });

  it('thiếu / ngoài 0–10 / lệch bước → lỗi ở khoá `score10`', () => {
    expect(scoreProblems([], free(null))).toEqual({ score10: 'MISSING' });
    expect(scoreProblems([], free(10.5))).toEqual({ score10: 'OUT_OF_RANGE' });
    expect(scoreProblems([], free(7.3))).toEqual({ score10: 'INVALID_STEP' });
    expect(previewScore([], free(null)).score10).toBeNull();
  });
});

describe('định dạng số kiểu Việt (dấu phẩy, không Intl)', () => {
  it('formatScore luôn một chữ số lẻ; formatCriterionScore bỏ ",0" thừa', () => {
    expect(formatScore(10)).toBe('10,0');
    expect(formatScore(6.66)).toBe('6,7');
    expect(formatCriterionScore(2.5)).toBe('2,5');
    expect(formatCriterionScore(3)).toBe('3');
  });
});
