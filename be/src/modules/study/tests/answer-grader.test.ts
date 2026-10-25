import { gradeAnswer, normalizeAnswer, type GradableItem } from "../services/answer-grader";

const mc: GradableItem = {
  type: "MULTIPLE_CHOICE",
  options: [{ id: "o_aaaaaa" }, { id: "o_bbbbbb" }, { id: "o_cccccc" }],
  correctOptionIds: ["o_bbbbbb"],
  acceptedAnswers: [],
  matchMode: "IGNORE_CASE",
};

const multi: GradableItem = {
  type: "MULTI_SELECT",
  options: [{ id: "o_a" }, { id: "o_b" }, { id: "o_c" }, { id: "o_d" }],
  correctOptionIds: ["o_a", "o_b"],
  acceptedAnswers: [],
  matchMode: "IGNORE_CASE",
};

const fill = (answers: string[], matchMode: GradableItem["matchMode"]): GradableItem => ({
  type: "FILL_BLANK",
  correctOptionIds: [],
  acceptedAnswers: answers,
  matchMode,
});

describe("answer-grader — hàm chấm THUẦN dùng chung p4-01 / p4-02 / p5-01", () => {
  describe("MULTIPLE_CHOICE / TRUE_FALSE", () => {
    it("đúng khi chọn đúng 1 id đáp án; sai khi chọn khác, chọn nhiều hoặc không chọn", () => {
      expect(gradeAnswer(mc, { optionIds: ["o_bbbbbb"] }).correct).toBe(true);
      expect(gradeAnswer(mc, { optionIds: ["o_aaaaaa"] }).correct).toBe(false);
      expect(gradeAnswer(mc, { optionIds: ["o_bbbbbb", "o_aaaaaa"] }).correct).toBe(false);
      expect(gradeAnswer(mc, { optionIds: [] }).correct).toBe(false);
      expect(gradeAnswer(mc, {}).correct).toBe(false);
    });

    it("TRUE_FALSE chấm theo id cố định o_true/o_false", () => {
      const tf: GradableItem = { type: "TRUE_FALSE", options: [{ id: "o_true" }, { id: "o_false" }], correctOptionIds: ["o_false"], acceptedAnswers: [], matchMode: "IGNORE_CASE" };
      expect(gradeAnswer(tf, { optionIds: ["o_false"] }).correct).toBe(true);
      expect(gradeAnswer(tf, { optionIds: ["o_true"] }).correct).toBe(false);
    });
  });

  describe("MULTI_SELECT", () => {
    it("đúng khi tập chọn BẰNG tập đúng (không phụ thuộc thứ tự)", () => {
      expect(gradeAnswer(multi, { optionIds: ["o_b", "o_a"] })).toEqual({ correct: true, partial: 1 });
    });

    it("thiếu hoặc thừa đều sai; partial = đúng∩chọn/|đúng| − sai∩chọn/|sai| (sàn 0)", () => {
      expect(gradeAnswer(multi, { optionIds: ["o_a"] })).toEqual({ correct: false, partial: 0.5 });
      // chọn cả 2 đúng + 1 sai (trong 2 sai) → 1 − 1/2 = 0.5
      expect(gradeAnswer(multi, { optionIds: ["o_a", "o_b", "o_c"] })).toEqual({ correct: false, partial: 0.5 });
      // chọn 1 đúng + 2 sai → 0.5 − 1 → sàn 0
      expect(gradeAnswer(multi, { optionIds: ["o_a", "o_c", "o_d"] }).partial).toBe(0);
      expect(gradeAnswer(multi, { optionIds: [] })).toEqual({ correct: false, partial: 0 });
    });
  });

  describe("FILL_BLANK — ST-20", () => {
    it("ST-20: 'Hà Nội' + IGNORE_ACCENTS, trả lời 'ha noi' → đúng", () => {
      expect(gradeAnswer(fill(["Hà Nội"], "IGNORE_ACCENTS"), { text: "ha noi" }).correct).toBe(true);
      expect(gradeAnswer(fill(["Hà Nội"], "IGNORE_ACCENTS"), { text: "  HA   NOI " }).correct).toBe(true);
      expect(gradeAnswer(fill(["Đà Nẵng"], "IGNORE_ACCENTS"), { text: "da nang" }).correct).toBe(true);
    });

    it("EXACT phân biệt hoa/thường VÀ dấu; IGNORE_CASE phân biệt dấu nhưng không hoa/thường", () => {
      expect(gradeAnswer(fill(["Hà Nội"], "EXACT"), { text: "ha noi" }).correct).toBe(false);
      expect(gradeAnswer(fill(["Hà Nội"], "EXACT"), { text: "hà nội" }).correct).toBe(false);
      expect(gradeAnswer(fill(["Hà Nội"], "EXACT"), { text: "Hà Nội" }).correct).toBe(true);
      expect(gradeAnswer(fill(["Hà Nội"], "IGNORE_CASE"), { text: "HÀ NỘI" }).correct).toBe(true);
      expect(gradeAnswer(fill(["Hà Nội"], "IGNORE_CASE"), { text: "ha noi" }).correct).toBe(false);
    });

    it("dạng dựng sẵn (NFC) và tổ hợp (NFD) của cùng chữ là MỘT — kể cả chế độ EXACT", () => {
      const composed = "Hà Nội".normalize("NFC"); // U+00E0, U+1ED9
      const decomposed = composed.normalize("NFD"); // a + U+0300, o + U+0323 + U+0302
      expect(composed).not.toBe(decomposed);
      expect(gradeAnswer(fill([composed], "EXACT"), { text: decomposed }).correct).toBe(true);
      expect(gradeAnswer(fill([decomposed], "IGNORE_CASE"), { text: composed }).correct).toBe(true);
    });

    it("emoji (kể cả ghép ZWJ) so khớp theo chuỗi, không vỡ chuẩn hoá", () => {
      const family = "👨‍👩‍👧";
      expect(gradeAnswer(fill([family], "EXACT"), { text: family }).correct).toBe(true);
      expect(gradeAnswer(fill(["👍"], "IGNORE_ACCENTS"), { text: "👍" }).correct).toBe(true);
      expect(gradeAnswer(fill(["👍"], "EXACT"), { text: "👎" }).correct).toBe(false);
    });

    it("nhiều đáp án chấp nhận: khớp bất kỳ; chuỗi rỗng / thiếu text luôn sai", () => {
      const item = fill(["Hà Nội", "Thăng Long"], "IGNORE_ACCENTS");
      expect(gradeAnswer(item, { text: "thang long" }).correct).toBe(true);
      expect(gradeAnswer(item, { text: "" }).correct).toBe(false);
      expect(gradeAnswer(item, { text: "   " }).correct).toBe(false);
      expect(gradeAnswer(item, {}).correct).toBe(false);
    });
  });

  it("FLASHCARD không chấm (SR tự đánh giá): luôn correct=false", () => {
    const card: GradableItem = { type: "FLASHCARD", correctOptionIds: [], acceptedAnswers: [], matchMode: "IGNORE_CASE" };
    expect(gradeAnswer(card, { text: "bất kỳ" })).toEqual({ correct: false });
  });

  it("normalizeAnswer gộp khoảng trắng và trim ở mọi chế độ", () => {
    expect(normalizeAnswer("  a   b  ", "EXACT")).toBe("a b");
    expect(normalizeAnswer("  A   B  ", "IGNORE_CASE")).toBe("a b");
    expect(normalizeAnswer("  Á   B  ", "IGNORE_ACCENTS")).toBe("a b");
  });
});
