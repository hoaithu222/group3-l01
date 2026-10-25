/**
 * Unit — DTO Zod của `chat-extensions` (p7-04 be.md §3): `.strict()` chặn trường lạ (client giả `kind`/`voterIds`…), mặc định, khoảng số lượng, ObjectId, ép ngày, "ít nhất một trường" khi sửa.
 */
import { createPollSchema, createReminderSchema, createScheduledSchema, listMyRemindersQuerySchema, listMyScheduledQuerySchema, scopeParamsSchema, toResourceSchema, toTaskSchema, updateScheduledSchema, voteSchema, votersQuerySchema } from "../dtos";

const UUID = "11111111-1111-4111-8111-111111111111";
const OID = "a1".repeat(12);

describe("createPollSchema", () => {
  const base = { clientMessageId: UUID, question: "  Đi ăn ở đâu?  ", options: ["Phở", "Bún"] };

  it("hợp lệ: cắt khoảng trắng, mặc định multi/anonymous = false, closesAt ép thành Date", () => {
    const r = createPollSchema.parse({ ...base, closesAt: "2026-10-01T00:00:00Z" });
    expect(r).toMatchObject({ question: "Đi ăn ở đâu?", options: ["Phở", "Bún"], multi: false, anonymous: false });
    expect(r.closesAt).toBeInstanceOf(Date);
  });

  it("từ chối: trường lạ (strict), < 2 hoặc > 10 lựa chọn, clientMessageId không phải uuid, câu hỏi/lựa chọn rỗng, hạn không phải ngày, threadId sai", () => {
    expect(createPollSchema.safeParse({ ...base, kind: "SYSTEM" }).success).toBe(false);
    expect(createPollSchema.safeParse({ ...base, voterIds: [OID] }).success).toBe(false);
    expect(createPollSchema.safeParse({ ...base, options: ["Một"] }).success).toBe(false);
    expect(createPollSchema.safeParse({ ...base, options: Array.from({ length: 11 }, (_, i) => `L${i}`) }).success).toBe(false);
    expect(createPollSchema.safeParse({ ...base, clientMessageId: "abc" }).success).toBe(false);
    expect(createPollSchema.safeParse({ ...base, question: "   " }).success).toBe(false);
    expect(createPollSchema.safeParse({ ...base, options: ["Phở", "  "] }).success).toBe(false);
    expect(createPollSchema.safeParse({ ...base, closesAt: "không phải ngày" }).success).toBe(false);
    expect(createPollSchema.safeParse({ ...base, threadId: "xyz" }).success).toBe(false);
    expect(createPollSchema.safeParse({ ...base, threadId: OID }).success).toBe(true);
  });
});

describe("voteSchema / votersQuerySchema", () => {
  it("vote: 1–10 id chuỗi, không trường lạ", () => {
    expect(voteSchema.safeParse({ optionIds: ["aaaaaaaa"] }).success).toBe(true);
    expect(voteSchema.safeParse({ optionIds: [] }).success).toBe(false);
    expect(voteSchema.safeParse({ optionIds: Array.from({ length: 11 }, () => "aaaaaaaa") }).success).toBe(false);
    expect(voteSchema.safeParse({ optionIds: ["a".repeat(17)] }).success).toBe(false);
    expect(voteSchema.safeParse({ optionIds: ["aaaaaaaa"], userId: OID }).success).toBe(false);
  });

  it("voters: optionId bắt buộc, limit mặc định 50 và ≤ 100", () => {
    expect(votersQuerySchema.parse({ optionId: "aaaaaaaa" })).toMatchObject({ limit: 50 });
    expect(votersQuerySchema.parse({ optionId: "aaaaaaaa", limit: "20" }).limit).toBe(20);
    expect(votersQuerySchema.safeParse({ optionId: "aaaaaaaa", limit: 101 }).success).toBe(false);
    expect(votersQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe("createScheduledSchema / updateScheduledSchema", () => {
  const base = { sendAt: "2026-10-01T02:00:00Z", timezone: "Asia/Ho_Chi_Minh" };

  it("tạo: nội dung/mention/tệp tuỳ chọn có mặc định rỗng; sendAt ép thành Date; mention sai định dạng bị từ chối", () => {
    const r = createScheduledSchema.parse({ ...base, content: "Nhắc họp" });
    expect(r).toMatchObject({ content: "Nhắc họp", mentions: [], attachmentAssetIds: [] });
    expect(r.sendAt).toBeInstanceOf(Date);
    expect(createScheduledSchema.safeParse({ ...base, mentions: [{ type: "USER", targetId: "không-phải-oid" }] }).success).toBe(false);
    expect(createScheduledSchema.safeParse({ ...base, mentions: [{ type: "ROLE", targetId: "ADMIN" }, { type: "ALL" }, { type: "USER", targetId: OID }] }).success).toBe(true);
    expect(createScheduledSchema.safeParse({ ...base, mentions: [{ type: "ROLE", targetId: "OWNER" }] }).success).toBe(false);
    expect(createScheduledSchema.safeParse({ ...base, attachmentAssetIds: ["xx"] }).success).toBe(false);
    expect(createScheduledSchema.safeParse({ ...base, timezone: "" }).success).toBe(false);
    expect(createScheduledSchema.safeParse({ ...base, status: "SENT" }).success).toBe(false);
    expect(createScheduledSchema.safeParse({ timezone: "UTC" }).success).toBe(false);
  });

  it("sửa: expectedVersion bắt buộc (≥ 1) và phải có ÍT NHẤT một trường thay đổi; replyToId cho phép null (gỡ trả lời)", () => {
    expect(updateScheduledSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(updateScheduledSchema.safeParse({ content: "mới" }).success).toBe(false);
    expect(updateScheduledSchema.safeParse({ content: "mới", expectedVersion: 0 }).success).toBe(false);
    expect(updateScheduledSchema.safeParse({ content: "mới", expectedVersion: 2 }).success).toBe(true);
    expect(updateScheduledSchema.safeParse({ replyToId: null, expectedVersion: 1 }).success).toBe(true);
    expect(updateScheduledSchema.safeParse({ sendAt: "2026-10-05T00:00:00Z", expectedVersion: 1 }).success).toBe(true);
  });

  it("danh sách của tôi: status mặc định PENDING, chỉ nhận 4 trạng thái", () => {
    expect(listMyScheduledQuerySchema.parse({})).toMatchObject({ status: "PENDING" });
    expect(listMyScheduledQuerySchema.safeParse({ status: "SENDING" }).success).toBe(false);
    expect(listMyScheduledQuerySchema.safeParse({ scopeType: "CHANNEL", scopeId: OID }).success).toBe(true);
  });
});

describe("reminder / conversion / params", () => {
  it("reminder: remindAt ép Date, timezone bắt buộc; danh sách mặc định PENDING", () => {
    expect(createReminderSchema.parse({ remindAt: "2026-10-01T00:00:00Z", timezone: "UTC" }).remindAt).toBeInstanceOf(Date);
    expect(createReminderSchema.safeParse({ remindAt: "2026-10-01T00:00:00Z" }).success).toBe(false);
    expect(listMyRemindersQuerySchema.parse({})).toMatchObject({ status: "PENDING" });
    expect(listMyRemindersQuerySchema.safeParse({ status: "CANCELLED" }).success).toBe(false);
  });

  it("to-task: boardId ObjectId, title bắt buộc, includeQuote mặc định true, tối đa 10 người làm; to-resource: ≥ 1 assetId, xác nhận mặc định false", () => {
    expect(toTaskSchema.parse({ boardId: OID, title: "  Làm bài  " })).toMatchObject({ title: "Làm bài", assigneeIds: [], includeQuote: true });
    expect(toTaskSchema.safeParse({ boardId: "x", title: "a" }).success).toBe(false);
    expect(toTaskSchema.safeParse({ boardId: OID, title: "a", assigneeIds: Array.from({ length: 11 }, () => OID) }).success).toBe(false);
    expect(toTaskSchema.safeParse({ boardId: OID, title: "a", messageId: OID }).success).toBe(false);
    expect(toResourceSchema.parse({ workspaceId: OID, assetIds: [OID] })).toMatchObject({ confirmVisibilityExpansion: false });
    expect(toResourceSchema.safeParse({ workspaceId: OID, assetIds: [] }).success).toBe(false);
  });

  it("params: scopeType CHANNEL|CONVERSATION + scopeId ObjectId", () => {
    expect(scopeParamsSchema.safeParse({ scopeType: "CHANNEL", scopeId: OID }).success).toBe(true);
    expect(scopeParamsSchema.safeParse({ scopeType: "WORKSPACE", scopeId: OID }).success).toBe(false);
    expect(scopeParamsSchema.safeParse({ scopeType: "CONVERSATION", scopeId: "1" }).success).toBe(false);
  });
});
