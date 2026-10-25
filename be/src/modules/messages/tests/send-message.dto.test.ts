/**
 * Unit — `sendMessageSchema`/`editMessageSchema` (be.md p1-04 §3, MSG-03): người dùng
 * KHÔNG được giả tin hệ thống bằng cách gửi `kind`/`systemType`/`authorId`… trong
 * body. Schema dùng `.strict()` nên field lạ bị TỪ CHỐI 400 `VAL_001` (thay vì
 * lặng lẽ bỏ qua như be.md README MSG-03 mô tả "Zod strip") — kết quả cuối vẫn
 * đúng ý nghiệm thu: không bao giờ tạo được tin `kind=SYSTEM` từ API người dùng.
 * (Tầng service luôn ghi `kind:"USER"` — xem `message.service.send-thread.test.ts`.)
 */
import { sendMessageSchema, mentionInputSchema } from "../dtos/send-message.dto";
import { editMessageSchema } from "../dtos/edit-message.dto";
import { listMessagesQuerySchema } from "../dtos/list-messages.dto";
import { LIMITS } from "../../../core/constants/limits";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OID = "507f1f77bcf86cd799439011";

describe("sendMessageSchema — MSG-03 (chống giả tin hệ thống)", () => {
  it.each([
    ["kind", { kind: "SYSTEM" }],
    ["systemType", { systemType: "MEMBER_JOINED" }],
    ["systemPayload", { systemPayload: { a: 1 } }],
    ["authorId", { authorId: OID }],
    ["seq", { seq: 1 }],
    ["deletedAt", { deletedAt: new Date().toISOString() }],
  ])("body chứa field lạ '%s' → parse THẤT BẠI (strict), không lọt xuống service", (_name, extra) => {
    const result = sendMessageSchema.safeParse({ clientMessageId: CLIENT_ID, content: "Xin chào", ...extra });
    expect(result.success).toBe(false);
  });

  it("body hợp lệ → điền mặc định attachments/mentions rỗng, giữ threadRootId tuỳ chọn", () => {
    const parsed = sendMessageSchema.parse({ clientMessageId: CLIENT_ID, content: "Xin chào" });
    expect(parsed).toEqual({ clientMessageId: CLIENT_ID, content: "Xin chào", attachments: [], mentions: [] });

    const reply = sendMessageSchema.parse({ clientMessageId: CLIENT_ID, content: "Trả lời", threadRootId: OID });
    expect(reply.threadRootId).toBe(OID);
  });

  it("clientMessageId phải là UUID; tối đa attachmentsMax tệp, mentionsMax mention", () => {
    expect(sendMessageSchema.safeParse({ clientMessageId: "abc", content: "x" }).success).toBe(false);
    const tooManyFiles = Array.from({ length: LIMITS.message.attachmentsMax + 1 }, () => ({ assetId: OID }));
    expect(sendMessageSchema.safeParse({ clientMessageId: CLIENT_ID, attachments: tooManyFiles }).success).toBe(false);
    const tooManyMentions = Array.from({ length: LIMITS.message.mentionsMax + 1 }, () => ({ type: "ALL" }));
    expect(sendMessageSchema.safeParse({ clientMessageId: CLIENT_ID, content: "x", mentions: tooManyMentions }).success).toBe(false);
  });

  it("threadRootId sai định dạng ObjectId → thất bại", () => {
    expect(sendMessageSchema.safeParse({ clientMessageId: CLIENT_ID, content: "x", threadRootId: "khong-phai-id" }).success).toBe(false);
  });
});

describe("mentionInputSchema / editMessageSchema", () => {
  it("USER cần targetId ObjectId hợp lệ; ALL không cần; type lạ bị từ chối", () => {
    expect(mentionInputSchema.safeParse({ type: "USER", targetId: OID }).success).toBe(true);
    expect(mentionInputSchema.safeParse({ type: "USER", targetId: "xyz" }).success).toBe(false);
    expect(mentionInputSchema.safeParse({ type: "ALL" }).success).toBe(true);
    expect(mentionInputSchema.safeParse({ type: "EVERYONE" }).success).toBe(false);
  });

  it("ROLE (p3-04 @role): targetId chỉ ADMIN|MEMBER (không phải ObjectId); USER/ALL vẫn bắt buộc ObjectId", () => {
    expect(mentionInputSchema.safeParse({ type: "ROLE", targetId: "ADMIN" }).success).toBe(true);
    expect(mentionInputSchema.safeParse({ type: "ROLE", targetId: "MEMBER" }).success).toBe(true);
    expect(mentionInputSchema.safeParse({ type: "ROLE", targetId: "OWNER" }).success).toBe(false);
    expect(mentionInputSchema.safeParse({ type: "ROLE", targetId: OID }).success).toBe(false);
    expect(mentionInputSchema.safeParse({ type: "USER", targetId: "ADMIN" }).success).toBe(false);
    expect(mentionInputSchema.parse({ type: "ROLE", targetId: "ADMIN" })).toEqual({ type: "ROLE", targetId: "ADMIN" });
  });

  it("editMessageSchema: bắt buộc expectedVersion nguyên ≥ 1; mentions mặc định []", () => {
    expect(editMessageSchema.safeParse({ content: "x" }).success).toBe(false);
    expect(editMessageSchema.safeParse({ content: "x", expectedVersion: 0 }).success).toBe(false);
    expect(editMessageSchema.parse({ content: "x", expectedVersion: 2 })).toEqual({ content: "x", mentions: [], expectedVersion: 2 });
  });
});

describe("listMessagesQuerySchema", () => {
  it("chỉ MỘT trong beforeSeq/afterSeq/around; limit mặc định/tối đa theo LIMITS.pagination", () => {
    expect(listMessagesQuerySchema.safeParse({ beforeSeq: "5", afterSeq: "1" }).success).toBe(false);
    expect(listMessagesQuerySchema.parse({}).limit).toBe(LIMITS.pagination.default);
    expect(listMessagesQuerySchema.safeParse({ limit: String(LIMITS.pagination.max + 1) }).success).toBe(false);
    expect(listMessagesQuerySchema.parse({ afterSeq: "0", threadId: OID })).toMatchObject({ afterSeq: 0, threadId: OID });
  });
});
