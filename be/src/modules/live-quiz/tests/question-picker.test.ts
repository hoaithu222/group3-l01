import type { StudyItem } from "../../study/public";
import { decodeCorrect, eligibleQuestions, encodeCorrect, pickQuestions, toStoredQuestion } from "../services/live-quiz-question.picker";
import { mcItem, oid } from "./support/quiz-fakes";

const set = oid(9);
const item = (i: number, patch: Partial<StudyItem> = {}): StudyItem => ({ ...mcItem(set, oid(1), i, 1), ...patch });

describe("eligibleQuestions — chỉ trắc nghiệm MỘT đáp án đúng (README §1)", () => {
  it("giữ MULTIPLE_CHOICE hợp lệ và tính chỉ số đáp án đúng", () => {
    const [q] = eligibleQuestions([item(0)]);
    expect(q.correctIndex).toBe(1);
  });

  it("bỏ FILL_BLANK, MULTI_SELECT, TRUE_FALSE, FLASHCARD", () => {
    const types = ["FILL_BLANK", "MULTI_SELECT", "TRUE_FALSE", "FLASHCARD"] as const;
    expect(eligibleQuestions(types.map((type, i) => item(i, { type })))).toEqual([]);
  });

  it("bỏ câu có 0 hoặc ≥ 2 đáp án đúng, câu thiếu lựa chọn, đề rỗng, đáp án trỏ id lạ", () => {
    const base = item(0);
    const bad: StudyItem[] = [
      { ...base, correctOptionIds: [] },
      { ...base, correctOptionIds: [base.options[0].id, base.options[1].id] },
      { ...base, options: base.options.slice(0, 1), correctOptionIds: [base.options[0].id] },
      { ...base, prompt: "   " },
      { ...base, correctOptionIds: ["o_khonglap"] },
    ];
    expect(eligibleQuestions(bad)).toEqual([]);
  });
});

describe("pickQuestions", () => {
  const pool = eligibleQuestions([0, 1, 2, 3, 4].map((i) => item(i)));

  it("không xáo: giữ thứ tự bộ và cắt đúng số câu", () => {
    expect(pickQuestions(pool, 3, false).map((q) => q.item.order)).toEqual([0, 1, 2]);
  });

  it("xáo với rng tất định (Fisher–Yates) và không đổi mảng gốc", () => {
    const rng = () => 0;
    const picked = pickQuestions(pool, 5, true, rng);
    expect(picked.map((q) => q.item.order)).toEqual([1, 2, 3, 4, 0]);
    expect(pool.map((q) => q.item.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("count vượt kích thước/âm không ném lỗi", () => {
    expect(pickQuestions(pool, 99, false)).toHaveLength(5);
    expect(pickQuestions(pool, -1, false)).toEqual([]);
  });
});

describe("toStoredQuestion / encodeCorrect", () => {
  it("câu lưu Redis KHÔNG chứa đáp án đúng trong phần options; đáp án nằm ở hash riêng", () => {
    const [q] = eligibleQuestions([item(0)]);
    const stored = toStoredQuestion(q);
    expect(Object.keys(stored.options[0]).sort()).toEqual(["mediaAssetId", "text"]);
    expect(JSON.stringify(stored)).not.toContain(q.item.correctOptionIds[0]);
    expect(stored.itemId).toBe(q.item.id);
  });

  it("mã hoá/giải mã `<đúng>:<số lựa chọn>`", () => {
    expect(encodeCorrect(2, 4)).toBe("2:4");
    expect(decodeCorrect("2:4")).toEqual({ correctIndex: 2, optionCount: 4 });
    expect(decodeCorrect("x:y")).toBeNull();
  });
});
