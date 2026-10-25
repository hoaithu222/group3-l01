import { LIMITS } from "../../../core/constants/limits";
import {
  addChecklistItemSchema,
  attachSchema,
  createCommentSchema,
  deleteCommentSchema,
  getTaskQuerySchema,
  mentionablesQuerySchema,
  patchChecklistItemSchema,
  patchCommentSchema,
  patchTaskSchema,
} from "../dtos";

const id = "a".repeat(24);
const ok = (schema: { safeParse(v: unknown): { success: boolean } }, value: unknown) => schema.safeParse(value).success;
const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => i.toString(16).padStart(24, "0"));

describe("patchTaskSchema", () => {
  it("chỉ cần expectedVersion; trường vắng = giữ nguyên; null xoá mô tả/ngày/điểm; ngày coerce từ ISO", () => {
    const parsed = patchTaskSchema.parse({ expectedVersion: 2, dueDate: "2026-10-01T10:00:00.000Z", startDate: null, description: null, storyPoints: null });
    expect(parsed.dueDate).toEqual(new Date("2026-10-01T10:00:00.000Z"));
    expect(parsed).toMatchObject({ startDate: null, description: null, storyPoints: null });
    expect("title" in parsed).toBe(false);
    expect(ok(patchTaskSchema, { title: "x" })).toBe(false); // thiếu expectedVersion
    expect(ok(patchTaskSchema, { expectedVersion: 0 })).toBe(false);
  });

  it("giới hạn: tiêu đề 1..200 (trim), người làm ≤ 10 (khử trùng), nhãn ≤ 10, điểm 0..100 nguyên, mô tả ≤ 20.000 grapheme", () => {
    expect(ok(patchTaskSchema, { expectedVersion: 1, title: "   " })).toBe(false);
    expect(ok(patchTaskSchema, { expectedVersion: 1, title: "x".repeat(LIMITS.task.titleMax + 1) })).toBe(false);
    expect(patchTaskSchema.parse({ expectedVersion: 1, assigneeIds: [id, id] }).assigneeIds).toEqual([id]);
    expect(ok(patchTaskSchema, { expectedVersion: 1, assigneeIds: ids(11) })).toBe(false);
    expect(ok(patchTaskSchema, { expectedVersion: 1, labelIds: ids(11) })).toBe(false);
    expect(ok(patchTaskSchema, { expectedVersion: 1, storyPoints: 100 })).toBe(true);
    expect(ok(patchTaskSchema, { expectedVersion: 1, storyPoints: 101 })).toBe(false);
    expect(ok(patchTaskSchema, { expectedVersion: 1, storyPoints: 1.5 })).toBe(false);
    expect(ok(patchTaskSchema, { expectedVersion: 1, description: "x".repeat(LIMITS.task.descriptionMax) })).toBe(true);
    expect(ok(patchTaskSchema, { expectedVersion: 1, description: "x".repeat(LIMITS.task.descriptionMax + 1) })).toBe(false);
    // Đếm GRAPHEME: 20.000 emoji ghép (mỗi cái nhiều code unit) vẫn hợp lệ.
    expect(ok(patchTaskSchema, { expectedVersion: 1, description: "👨‍👩‍👧".repeat(LIMITS.task.descriptionMax) })).toBe(true);
    expect(ok(patchTaskSchema, { expectedVersion: 1, dueDate: "không-phải-ngày" })).toBe(false);
  });
});

describe("checklist schemas", () => {
  it("thêm mục: text bắt buộc, trim, ≤ 200 grapheme; afterItemId là ObjectId; HTML bị loại (text nằm trong RAW_FIELDS của sanitizeInput)", () => {
    expect(addChecklistItemSchema.parse({ text: "  Vẽ sơ đồ  " }).text).toBe("Vẽ sơ đồ");
    expect(addChecklistItemSchema.parse({ text: "Đọc <b>chương</b> 3<script>alert(1)</script>" }).text).toBe("Đọc chương 3");
    expect(addChecklistItemSchema.parse({ text: "so sánh a < b và <3" }).text).toBe("so sánh a < b và <3"); // không phá chữ thường
    expect(ok(addChecklistItemSchema, { text: "   " })).toBe(false);
    expect(ok(addChecklistItemSchema, { text: "<script>x</script>" })).toBe(false); // chỉ còn rỗng sau khi làm sạch
    expect(ok(addChecklistItemSchema, { text: "x".repeat(LIMITS.task.checklistItemMax) })).toBe(true);
    expect(ok(addChecklistItemSchema, { text: "x".repeat(LIMITS.task.checklistItemMax + 1) })).toBe(false);
    expect(ok(addChecklistItemSchema, { text: "ok", afterItemId: "không-phải-id" })).toBe(false);
    expect(ok(addChecklistItemSchema, { text: "ok", afterItemId: id })).toBe(true);
  });

  it("sửa mục: cần ít nhất một trường; moveAfterItemId null = lên đầu; done boolean", () => {
    expect(ok(patchChecklistItemSchema, {})).toBe(false);
    expect(ok(patchChecklistItemSchema, { done: true })).toBe(true);
    expect(ok(patchChecklistItemSchema, { moveAfterItemId: null })).toBe(true);
    expect(ok(patchChecklistItemSchema, { moveAfterItemId: id })).toBe(true);
    expect(ok(patchChecklistItemSchema, { done: "true" })).toBe(false);
    expect(ok(patchChecklistItemSchema, { text: "" })).toBe(false);
    expect(patchChecklistItemSchema.parse({ text: "<i>x</i>" }).text).toBe("x");
  });
});

describe("bình luận", () => {
  const base = { clientCommentId: "client-comment-1", content: "Chào", mentions: [], attachmentAssetIds: [] };

  it("tạo: clientCommentId 8..64; nội dung rỗng chỉ hợp lệ khi có tệp; ≤ 4000 grapheme; ≤ 5 tệp (khử trùng); ≤ 20 nhắc; mặc định rỗng", () => {
    expect(ok(createCommentSchema, base)).toBe(true);
    expect(ok(createCommentSchema, { ...base, clientCommentId: "ngan" })).toBe(false);
    expect(ok(createCommentSchema, { ...base, clientCommentId: "x".repeat(65) })).toBe(false);
    expect(ok(createCommentSchema, { ...base, content: "  \n " })).toBe(false); // trống
    expect(ok(createCommentSchema, { ...base, content: "", attachmentAssetIds: [id] })).toBe(true); // chỉ tệp
    expect(ok(createCommentSchema, { ...base, content: "x".repeat(LIMITS.task.commentMax) })).toBe(true);
    expect(ok(createCommentSchema, { ...base, content: "x".repeat(LIMITS.task.commentMax + 1) })).toBe(false);
    expect(ok(createCommentSchema, { ...base, attachmentAssetIds: ids(6) })).toBe(false);
    expect(createCommentSchema.parse({ ...base, attachmentAssetIds: [id, id] }).attachmentAssetIds).toEqual([id]);
    expect(ok(createCommentSchema, { ...base, mentions: ids(21).map((targetId) => ({ type: "USER", targetId })) })).toBe(false);
    expect(ok(createCommentSchema, { ...base, mentions: [{ type: "ALL", targetId: id }] })).toBe(false); // chỉ USER
    const defaults = createCommentSchema.parse({ clientCommentId: "client-comment-2", attachmentAssetIds: [id] });
    expect(defaults).toMatchObject({ content: "", mentions: [], attachmentAssetIds: [id] });
  });

  it("sửa: expectedVersion bắt buộc; xoá: lý do tuỳ chọn 10..500 ký tự", () => {
    expect(ok(patchCommentSchema, { content: "x", mentions: [], expectedVersion: 1 })).toBe(true);
    expect(ok(patchCommentSchema, { content: "x" })).toBe(false);
    expect(ok(deleteCommentSchema, {})).toBe(true);
    expect(ok(deleteCommentSchema, { reason: "Nội dung không phù hợp" })).toBe(true);
    expect(ok(deleteCommentSchema, { reason: "ngắn" })).toBe(false);
    expect(ok(deleteCommentSchema, { reason: "x".repeat(501) })).toBe(false);
  });
});

describe("tham số khác", () => {
  it("attach cần ObjectId; ?includeDeleted là 'true'/'false' (KHÔNG coerce boolean: 'false' ≠ true); mentionables q ≤ 50, mặc định rỗng", () => {
    expect(ok(attachSchema, { assetId: id })).toBe(true);
    expect(ok(attachSchema, { assetId: "abc" })).toBe(false);
    expect(getTaskQuerySchema.parse({ includeDeleted: "true" }).includeDeleted).toBe(true);
    expect(getTaskQuerySchema.parse({ includeDeleted: "false" }).includeDeleted).toBe(false);
    expect(getTaskQuerySchema.parse({}).includeDeleted).toBeUndefined();
    expect(ok(getTaskQuerySchema, { includeDeleted: "1" })).toBe(false);
    expect(mentionablesQuerySchema.parse({}).q).toBe("");
    expect(mentionablesQuerySchema.parse({ q: "  lan " }).q).toBe("lan");
    expect(ok(mentionablesQuerySchema, { q: "x".repeat(51) })).toBe(false);
  });
});
