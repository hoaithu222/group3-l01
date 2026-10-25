import { LIMITS } from "../../../core/constants/limits";
import type { StudyItem } from "../entities/study-item.interface";
import { collectMediaAssetIds, validateItems, type AssetCheck, type ItemValidationContext } from "../services/study-item.validator";
import { flash, mc } from "./support/harness";

const ACTOR = "0000000000000000000000a1";
const A1 = "0000000000000000000000c1";
const A2 = "0000000000000000000000c2";

function ctx(over: Partial<ItemValidationContext> = {}): ItemValidationContext {
  return { actorId: ACTOR, existingById: new Map(), deleteIds: new Set(), existingMedia: new Set(), assets: new Map(), ...over };
}

const readyAsset = (over: Partial<AssetCheck> = {}): AssetCheck => ({
  ownerId: ACTOR,
  scope: "STUDY",
  variant: "ORIGINAL",
  kind: "IMAGE",
  status: "READY",
  linked: false,
  ...over,
});

function existingItem(over: Partial<StudyItem> = {}): StudyItem {
  return {
    id: "0000000000000000000000d1",
    setId: "0000000000000000000000e1",
    ownerId: ACTOR,
    type: "FLASHCARD",
    prompt: "x",
    answerText: "y",
    options: [],
    correctOptionIds: [],
    acceptedAnswers: [],
    matchMode: "IGNORE_CASE",
    explanation: null,
    frontMediaAssetId: null,
    backMediaAssetId: null,
    audioAssetId: null,
    tags: [],
    order: 1024,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("study-item.validator — luật theo loại mục, lỗi có index", () => {
  describe("chuyển DTO → nội dung mục", () => {
    it("MULTIPLE_CHOICE: gán id lựa chọn `o_` + 6 ký tự và đổi index đáp án thành correctOptionIds", () => {
      const { items, errors } = validateItems([mc("k1")], ctx());
      expect(errors).toEqual([]);
      const c = items[0]!.content;
      expect(c.options.map((o) => o.id)).toEqual(expect.arrayContaining([expect.stringMatching(/^o_[A-Za-z0-9]{6}$/)]));
      expect(new Set(c.options.map((o) => o.id)).size).toBe(3);
      expect(c.correctOptionIds).toEqual([c.options[1]!.id]);
      expect(c.answerText).toBeNull();
    });

    it("giữ id lựa chọn client đã gửi (sửa mục cũ không làm đổi id)", () => {
      const { items } = validateItems([mc("k1", { options: [{ id: "o_keepAA", text: "A" }, { text: "B" }], correctOptionIndex: 0 })], ctx());
      expect(items[0]!.content.options[0]!.id).toBe("o_keepAA");
      expect(items[0]!.content.correctOptionIds).toEqual(["o_keepAA"]);
    });

    it("MULTI_SELECT: nhiều đáp án; TRUE_FALSE: 2 lựa chọn cố định o_true/o_false", () => {
      const ms = validateItems([{ type: "MULTI_SELECT", clientItemKey: "m", prompt: "p", options: [{ text: "A" }, { text: "B" }, { text: "C" }], correctOptionIndexes: [0, 2] }], ctx());
      expect(ms.errors).toEqual([]);
      const c = ms.items[0]!.content;
      expect(c.correctOptionIds).toEqual([c.options[0]!.id, c.options[2]!.id]);

      const tf = validateItems([{ type: "TRUE_FALSE", clientItemKey: "t", prompt: "p", correct: false }], ctx());
      expect(tf.items[0]!.content.options.map((o) => o.id)).toEqual(["o_true", "o_false"]);
      expect(tf.items[0]!.content.correctOptionIds).toEqual(["o_false"]);
    });

    it("FILL_BLANK: matchMode mặc định IGNORE_CASE; khử đáp án trùng theo chế độ so khớp; thẻ chuẩn hoá", () => {
      const r = validateItems([{ type: "FILL_BLANK", clientItemKey: "f", prompt: "p", acceptedAnswers: ["Hà Nội", "hà nội", "Thăng Long"], tags: ["Địa Lý", "địa lý"] }], ctx());
      expect(r.errors).toEqual([]);
      expect(r.items[0]!.content.matchMode).toBe("IGNORE_CASE");
      expect(r.items[0]!.content.acceptedAnswers).toEqual(["Hà Nội", "Thăng Long"]);
      expect(r.items[0]!.content.tags).toEqual(["dia ly"]);
    });

    it("mục cũ đổi loại: các trường của loại trước bị xoá trắng (PUT ghi đè)", () => {
      const r = validateItems([flash("k", { id: "0000000000000000000000d1" })], ctx({ existingById: new Map([["0000000000000000000000d1", existingItem({ type: "MULTIPLE_CHOICE", options: [{ id: "o_x", text: "x", mediaAssetId: null }] })]]) }));
      expect(r.errors).toEqual([]);
      expect(r.items[0]!.content.options).toEqual([]);
      expect(r.items[0]!.content.correctOptionIds).toEqual([]);
    });
  });

  describe("lỗi biên theo loại — mỗi lỗi có index, clientItemKey, field, code", () => {
    it("MC: đáp án ngoài phạm vi → STUDY_005 (ST-03 dạng `correctOptionIds không thuộc options`)", () => {
      const { errors } = validateItems([mc("a"), mc("b", { correctOptionIndex: 3 })], ctx());
      expect(errors).toEqual([{ index: 1, clientItemKey: "b", field: "correctOptionIndex", code: "STUDY_005" }]);
    });

    it("MULTI_SELECT: index ngoài phạm vi, trùng, rỗng", () => {
      const base = { type: "MULTI_SELECT", prompt: "p", options: [{ text: "A" }, { text: "B" }] };
      expect(validateItems([{ ...base, clientItemKey: "a", correctOptionIndexes: [0, 5] }], ctx()).errors[0]).toMatchObject({ field: "correctOptionIndexes", code: "STUDY_005" });
      expect(validateItems([{ ...base, clientItemKey: "b", correctOptionIndexes: [1, 1] }], ctx()).errors[0]).toMatchObject({ field: "correctOptionIndexes", code: "DUPLICATE" });
      expect(validateItems([{ ...base, clientItemKey: "c", correctOptionIndexes: [] }], ctx()).errors[0]).toMatchObject({ field: "correctOptionIndexes", code: "TOO_FEW" });
    });

    it("số lựa chọn ngoài [2, 6]; id lựa chọn trùng", () => {
      expect(validateItems([mc("a", { options: [{ text: "A" }] })], ctx()).errors[0]).toMatchObject({ field: "options", code: "TOO_FEW" });
      const seven = Array.from({ length: LIMITS.study.optionsMax + 1 }, (_, i) => ({ text: `o${i}` }));
      expect(validateItems([mc("b", { options: seven })], ctx()).errors[0]).toMatchObject({ field: "options", code: "TOO_MANY" });
      const dup = [{ id: "o_dupAAA", text: "A" }, { id: "o_dupAAA", text: "B" }];
      expect(validateItems([mc("c", { options: dup })], ctx()).errors[0]).toMatchObject({ field: "options", code: "DUPLICATE_OPTION_ID" });
    });

    it("FILL_BLANK: rỗng, quá dài, không có đáp án", () => {
      const f = (extra: Record<string, unknown>) => ({ type: "FILL_BLANK", clientItemKey: "f", prompt: "p", ...extra });
      expect(validateItems([f({ acceptedAnswers: [] })], ctx()).errors[0]).toMatchObject({ field: "acceptedAnswers", code: "TOO_FEW" });
      expect(validateItems([f({ acceptedAnswers: ["   "] })], ctx()).errors[0]).toMatchObject({ field: "acceptedAnswers.0", code: "REQUIRED" });
      expect(validateItems([f({ acceptedAnswers: ["x".repeat(LIMITS.study.acceptedAnswerMax + 1)] })], ctx()).errors[0]).toMatchObject({ code: "TOO_LONG" });
      expect(validateItems([f({})], ctx()).errors[0]).toMatchObject({ field: "acceptedAnswers", code: "REQUIRED" });
    });

    it("trường chung: prompt rỗng/quá dài, loại lạ, thiếu clientItemKey, mục không phải object", () => {
      expect(validateItems([flash("a", { prompt: "  " })], ctx()).errors[0]).toMatchObject({ field: "prompt", code: "REQUIRED" });
      expect(validateItems([flash("b", { prompt: "x".repeat(LIMITS.study.promptMax + 1) })], ctx()).errors[0]).toMatchObject({ field: "prompt", code: "TOO_LONG" });
      expect(validateItems([{ type: "NOPE", clientItemKey: "c", prompt: "p" }], ctx()).errors[0]).toMatchObject({ field: "type", code: "INVALID_TYPE" });
      expect(validateItems([{ type: "FLASHCARD", prompt: "p", answerText: "a" }], ctx()).errors[0]).toMatchObject({ clientItemKey: null, field: "clientItemKey", code: "REQUIRED" });
      expect(validateItems(["chuỗi", null, 5], ctx()).errors.map((e) => e.code)).toEqual(["INVALID_TYPE", "INVALID_TYPE", "INVALID_TYPE"]);
    });

    it("GOM MỌI lỗi (không dừng ở lỗi đầu), sắp theo index", () => {
      const { errors, items } = validateItems([flash("a", { prompt: "" }), flash("ok"), mc("c", { correctOptionIndex: 9 }), flash("d", { answerText: "" })], ctx());
      expect(errors.map((e) => [e.index, e.field])).toEqual([[0, "prompt"], [2, "correctOptionIndex"], [3, "answerText"]]);
      expect(items.map((i) => i.clientItemKey)).toEqual(["ok"]);
    });

    it("cắt ở tối đa 50 lỗi", () => {
      const raw = Array.from({ length: 80 }, (_, i) => flash(`k${i}`, { prompt: "" }));
      expect(validateItems(raw, ctx()).errors).toHaveLength(LIMITS.study.errorDetailsMax);
    });
  });

  describe("khoá, id và vị trí", () => {
    it("clientItemKey trùng trong lượt → DUPLICATE_KEY", () => {
      const { errors } = validateItems([flash("x"), flash("x")], ctx());
      expect(errors).toEqual([{ index: 1, clientItemKey: "x", field: "clientItemKey", code: "DUPLICATE_KEY" }]);
    });

    it("id không thuộc bộ → NOT_FOUND; id trùng trong lượt; vừa sửa vừa xoá", () => {
      const known = "0000000000000000000000d1";
      const c = ctx({ existingById: new Map([[known, existingItem()]]), deleteIds: new Set([known]) });
      expect(validateItems([flash("a", { id: "0000000000000000000000ff" })], c).errors[0]).toMatchObject({ field: "id", code: "NOT_FOUND" });
      expect(validateItems([flash("b", { id: known })], c).errors[0]).toMatchObject({ field: "id", code: "CONFLICT_DELETE" });
      const c2 = ctx({ existingById: new Map([[known, existingItem()]]) });
      expect(validateItems([flash("a", { id: known }), flash("b", { id: known })], c2).errors[0]).toMatchObject({ index: 1, code: "DUPLICATE_ID" });
    });

    it("afterClientItemKey: tự tham chiếu / không tồn tại → INVALID_REF; tham chiếu khoá khác trong lượt hoặc id mục cũ → hợp lệ", () => {
      expect(validateItems([flash("a", { afterClientItemKey: "a" })], ctx()).errors[0]).toMatchObject({ field: "afterClientItemKey", code: "INVALID_REF" });
      expect(validateItems([flash("a", { afterClientItemKey: "ghost" })], ctx()).errors[0]).toMatchObject({ code: "INVALID_REF" });
      expect(validateItems([flash("a"), flash("b", { afterClientItemKey: "a" })], ctx()).errors).toEqual([]);
      const known = "0000000000000000000000d1";
      expect(validateItems([flash("a", { afterClientItemKey: known })], ctx({ existingById: new Map([[known, existingItem()]]) })).errors).toEqual([]);
      expect(validateItems([flash("a", { afterClientItemKey: known })], ctx({ existingById: new Map([[known, existingItem()]]), deleteIds: new Set([known]) })).errors[0]).toMatchObject({ code: "INVALID_REF" });
    });
  });

  describe("asset — READY, scope STUDY, đúng loại, của người lưu, chưa gắn (hoặc đã gắn đúng mục này)", () => {
    const front = (extra: Record<string, unknown> = {}) => flash("a", { frontMediaAssetId: A1, ...extra });

    it("hợp lệ khi asset READY/STUDY/IMAGE của người lưu và chưa gắn", () => {
      expect(validateItems([front()], ctx({ assets: new Map([[A1, readyAsset()]]) })).errors).toEqual([]);
    });

    it.each([
      ["không tồn tại", null],
      ["chưa READY", readyAsset({ status: "PROCESSING" })],
      ["sai scope", readyAsset({ scope: "RESOURCE" })],
      ["là bản THUMB", readyAsset({ variant: "THUMB" })],
      ["sai loại (âm thanh làm ảnh)", readyAsset({ kind: "AUDIO" })],
      ["của người khác", readyAsset({ ownerId: "0000000000000000000000ee" })],
      ["đã gắn nơi khác", readyAsset({ linked: true })],
    ])("STUDY_006 khi asset %s", (_name, info) => {
      const { errors } = validateItems([front()], ctx({ assets: new Map([[A1, info]]) }));
      expect(errors).toEqual([{ index: 0, clientItemKey: "a", field: "frontMediaAssetId", code: "STUDY_006" }]);
    });

    it("âm thanh phải là kind AUDIO; ảnh lựa chọn ở đường dẫn options.N.mediaAssetId", () => {
      const assets = new Map([[A1, readyAsset({ kind: "AUDIO" })], [A2, readyAsset({ kind: "AUDIO" })]]);
      expect(validateItems([flash("a", { audioAssetId: A1 })], ctx({ assets })).errors).toEqual([]);
      const bad = mc("m", { options: [{ text: "A" }, { text: "B", mediaAssetId: A2 }] });
      expect(validateItems([bad], ctx({ assets })).errors[0]).toMatchObject({ field: "options.1.mediaAssetId", code: "STUDY_006" });
    });

    it("mục cũ giữ nguyên asset đã gắn → không kiểm lại; asset đang gắn ở MỤC KHÁC của bộ → STUDY_006", () => {
      const known = "0000000000000000000000d1";
      const item = existingItem({ id: known, frontMediaAssetId: A1 });
      const own = validateItems([flash("a", { id: known, frontMediaAssetId: A1 })], ctx({ existingById: new Map([[known, item]]), existingMedia: new Set([A1]) }));
      expect(own.errors).toEqual([]);
      const steal = validateItems([flash("b", { frontMediaAssetId: A1 })], ctx({ existingById: new Map([[known, item]]), existingMedia: new Set([A1]) }));
      expect(steal.errors[0]).toMatchObject({ field: "frontMediaAssetId", code: "STUDY_006" });
    });

    it("cùng một asset MỚI dùng cho hai mục trong một lượt → mục sau bị STUDY_006; hai lựa chọn cùng mục thì được", () => {
      const assets = new Map([[A1, readyAsset()]]);
      const twice = validateItems([front(), flash("b", { frontMediaAssetId: A1 })], ctx({ assets }));
      expect(twice.errors).toEqual([{ index: 1, clientItemKey: "b", field: "frontMediaAssetId", code: "STUDY_006" }]);
      const sameItem = validateItems([front({ backMediaAssetId: A1 })], ctx({ assets }));
      expect(sameItem.errors).toEqual([]);
    });
  });

  it("collectMediaAssetIds đọc phòng thủ dữ liệu thô: bỏ id sai định dạng, gồm cả ảnh lựa chọn", () => {
    const ids = collectMediaAssetIds([
      flash("a", { frontMediaAssetId: A1, backMediaAssetId: "khong-phai-id" }),
      mc("b", { options: [{ text: "x", mediaAssetId: A2 }, { text: "y" }] }),
      null,
      "chuỗi",
    ]);
    expect(ids.sort()).toEqual([A1, A2]);
  });
});
