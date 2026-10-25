import type { RubricCriterion } from "../entities/task-review.interface";
import { computeScore, evaluateScore, round1 } from "../services/review/review-score";

const rubric: RubricCriterion[] = [
  { id: "r_AAAAAA", label: "Đúng yêu cầu", description: null, maxScore: 4 },
  { id: "r_BBBBBB", label: "Chất lượng mã", description: "Dễ đọc", maxScore: 3 },
  { id: "r_CCCCCC", label: "Trình bày", description: null, maxScore: 3 },
];

describe("review-score — tính điểm quy về thang 10 (PM2-31)", () => {
  it("PM2-31: rubric 4 + 3 + 3, chấm 3 + 3 + 2 → 8,0", () => {
    const result = computeScore(rubric, { rubricScores: [{ criterionId: "r_AAAAAA", score: 3 }, { criterionId: "r_BBBBBB", score: 3 }, { criterionId: "r_CCCCCC", score: 2 }] });
    expect(result.score10).toBe(8);
    expect(result.rubricScores).toEqual([
      { criterionId: "r_AAAAAA", score: 3 },
      { criterionId: "r_BBBBBB", score: 3 },
      { criterionId: "r_CCCCCC", score: 2 },
    ]);
  });

  it("làm tròn 1 chữ số: 7/9 → 7,8; nửa lên; điểm bước 0,5 được nhận", () => {
    const nine: RubricCriterion[] = [{ id: "r_AAAAAA", label: "x", description: null, maxScore: 9 }];
    expect(computeScore(nine, { rubricScores: [{ criterionId: "r_AAAAAA", score: 7 }] }).score10).toBe(7.8);
    expect(computeScore(rubric, { rubricScores: [{ criterionId: "r_AAAAAA", score: 3.5 }, { criterionId: "r_BBBBBB", score: 2.5 }, { criterionId: "r_CCCCCC", score: 3 }] }).score10).toBe(9);
    expect(round1(1.25)).toBe(1.3);
    expect(round1(0.05)).toBe(0.1);
  });

  it("thứ tự điểm trong yêu cầu không quan trọng; kết quả luôn theo thứ tự rubric", () => {
    const result = computeScore(rubric, { rubricScores: [{ criterionId: "r_CCCCCC", score: 3 }, { criterionId: "r_AAAAAA", score: 4 }, { criterionId: "r_BBBBBB", score: 3 }] });
    expect(result.score10).toBe(10);
    expect(result.rubricScores.map((s) => s.criterionId)).toEqual(["r_AAAAAA", "r_BBBBBB", "r_CCCCCC"]);
  });

  it("vượt điểm tối đa / âm / sai bước 0,5 / thiếu / thừa / trùng tiêu chí → REVIEW_002 kèm details từng tiêu chí", () => {
    const r = evaluateScore(rubric, {
      rubricScores: [
        { criterionId: "r_AAAAAA", score: 5 }, // vượt tối đa 4
        { criterionId: "r_BBBBBB", score: 2.3 }, // sai bước
        { criterionId: "r_ZZZZZZ", score: 1 }, // không có trong rubric
      ],
    });
    expect(r).toEqual({ ok: false, problems: { criteria: { r_AAAAAA: "OUT_OF_RANGE", r_BBBBBB: "INVALID_STEP", r_ZZZZZZ: "UNKNOWN", r_CCCCCC: "MISSING" } } });

    const dup = evaluateScore(rubric, { rubricScores: [{ criterionId: "r_AAAAAA", score: 1 }, { criterionId: "r_AAAAAA", score: 2 }, { criterionId: "r_BBBBBB", score: 1 }, { criterionId: "r_CCCCCC", score: -1 }] });
    expect(dup).toEqual({ ok: false, problems: { criteria: { r_AAAAAA: "DUPLICATE", r_CCCCCC: "OUT_OF_RANGE" } } });

    expect(() => computeScore(rubric, { rubricScores: [] })).toThrow(expect.objectContaining({ statusCode: 400, errorCode: "REVIEW_002" }));
  });

  it("không rubric: bắt buộc score10 (0–10, bước 0,5), không nhận điểm theo tiêu chí", () => {
    expect(computeScore([], { rubricScores: [], score10: 7.5 })).toEqual({ score10: 7.5, rubricScores: [] });
    expect(evaluateScore([], { rubricScores: [] })).toEqual({ ok: false, problems: { score10: "REQUIRED" } });
    expect(evaluateScore([], { rubricScores: [], score10: 10.5 })).toEqual({ ok: false, problems: { score10: "OUT_OF_RANGE" } });
    expect(evaluateScore([], { rubricScores: [], score10: 7.25 })).toEqual({ ok: false, problems: { score10: "INVALID_STEP" } });
    expect(evaluateScore([], { rubricScores: [], score10: -1 })).toEqual({ ok: false, problems: { score10: "OUT_OF_RANGE" } });
    expect(evaluateScore([], { rubricScores: [{ criterionId: "r_AAAAAA", score: 1 }], score10: 5 })).toEqual({ ok: false, problems: { criteria: { r_AAAAAA: "UNKNOWN" } } });
  });

  it("có rubric thì bỏ qua score10 gửi kèm (chỉ tính từ điểm tiêu chí)", () => {
    const r = computeScore(rubric, { rubricScores: rubric.map((c) => ({ criterionId: c.id, score: c.maxScore })), score10: 1 });
    expect(r.score10).toBe(10);
  });
});
