import type { StudyItem } from "../entities/study-item.interface";
import { eligibleItems, pickQuestions, shuffled, toPublicQuestion } from "../services/mock-question-picker";

let seq = 0;
function item(type: StudyItem["type"], extra: Partial<StudyItem> = {}): StudyItem {
  seq += 1;
  const id = seq.toString(16).padStart(24, "0");
  const isChoice = type === "MULTIPLE_CHOICE" || type === "MULTI_SELECT" || type === "TRUE_FALSE";
  return {
    id,
    setId: "s".repeat(24),
    ownerId: "o".repeat(24),
    type,
    prompt: `Câu ${id}`,
    answerText: type === "FLASHCARD" ? "Mặt sau" : null,
    options: isChoice ? [{ id: "o_aaaaaa", text: "A", mediaAssetId: null }, { id: "o_bbbbbb", text: "B", mediaAssetId: null }, { id: "o_cccccc", text: "C", mediaAssetId: null }] : [],
    correctOptionIds: isChoice ? ["o_bbbbbb"] : [],
    acceptedAnswers: type === "FILL_BLANK" ? ["hà nội"] : [],
    matchMode: "IGNORE_CASE",
    explanation: "Vì sao",
    frontMediaAssetId: null,
    backMediaAssetId: null,
    audioAssetId: null,
    tags: [],
    order: seq,
    version: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  };
}

/** `random` tất định: luôn 0 → Fisher–Yates xoay danh sách (`[1,2,3,4]` → `[2,3,4,1]`). */
const first = (): number => 0;

describe("mock-question-picker (thuần)", () => {
  it("loại FLASHCARD, giữ 4 loại chấm được", () => {
    const items = [item("FLASHCARD"), item("MULTIPLE_CHOICE"), item("MULTI_SELECT"), item("TRUE_FALSE"), item("FILL_BLANK")];
    const picked = pickQuestions(items, { count: 10, shuffle: false });
    expect(picked.map((q) => q.type)).toEqual(["MULTIPLE_CHOICE", "MULTI_SELECT", "TRUE_FALSE", "FILL_BLANK"]);
  });

  it("lọc theo thẻ (chuẩn hoá không dấu/hoa) — chỉ lấy câu có ít nhất một thẻ khớp", () => {
    const a = item("MULTIPLE_CHOICE", { tags: ["ngu phap"] });
    const b = item("MULTIPLE_CHOICE", { tags: ["tu vung"] });
    const c = item("MULTIPLE_CHOICE", { tags: [] });
    expect(eligibleItems([a, b, c], ["Ngữ Pháp"]).map((i) => i.id)).toEqual([a.id]);
    expect(eligibleItems([a, b, c], []).length).toBe(3);
  });

  it("count lớn hơn số câu có → cắt về số câu có; count nhỏ → cắt bớt", () => {
    const items = Array.from({ length: 3 }, () => item("MULTIPLE_CHOICE"));
    expect(pickQuestions(items, { count: 50, shuffle: false })).toHaveLength(3);
    expect(pickQuestions(items, { count: 2, shuffle: false })).toHaveLength(2);
  });

  it("shuffle=false giữ thứ tự bộ và thứ tự lựa chọn; shuffle=true xáo câu + lựa chọn (trắc nghiệm) nhưng KHÔNG đụng TRUE_FALSE", () => {
    const mcq = item("MULTIPLE_CHOICE");
    const tf = item("TRUE_FALSE", { options: [{ id: "o_true", text: "Đúng", mediaAssetId: null }, { id: "o_false", text: "Sai", mediaAssetId: null }], correctOptionIds: ["o_true"] });
    const keep = pickQuestions([mcq, tf], { count: 2, shuffle: false });
    expect(keep.map((q) => q.itemId)).toEqual([mcq.id, tf.id]);
    expect(keep[0].options.map((o) => o.id)).toEqual(["o_aaaaaa", "o_bbbbbb", "o_cccccc"]);

    const mixed = pickQuestions([mcq, tf], { count: 2, shuffle: true, random: first });
    expect(mixed.map((q) => q.itemId)).toEqual([tf.id, mcq.id]);
    expect(mixed[1].options.map((o) => o.id)).toEqual(["o_bbbbbb", "o_cccccc", "o_aaaaaa"]);
    expect(mixed[0].options.map((o) => o.id)).toEqual(["o_true", "o_false"]);
  });

  it("snapshot là BẢN SAO (sửa bộ sau đó không đổi đề) và toPublicQuestion không lộ đáp án/giải thích", () => {
    const src = item("MULTIPLE_CHOICE");
    const [q] = pickQuestions([src], { count: 1, shuffle: false });
    src.correctOptionIds.push("o_aaaaaa");
    expect(q.correctOptionIds).toEqual(["o_bbbbbb"]);

    const pub = toPublicQuestion(q, 0);
    const json = JSON.stringify(pub);
    expect(json).not.toContain("correctOptionIds");
    expect(json).not.toContain("acceptedAnswers");
    expect(json).not.toContain("explanation");
    expect(Object.keys(pub).sort()).toEqual(["frontMediaAssetId", "index", "itemId", "options", "prompt", "type"]);
  });

  it("shuffled không sửa mảng gốc", () => {
    const src = [1, 2, 3, 4];
    expect(shuffled(src, first)).toEqual([2, 3, 4, 1]);
    expect(src).toEqual([1, 2, 3, 4]);
  });
});
