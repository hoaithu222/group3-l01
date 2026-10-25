/**
 * Unit — `services/mention-validator.ts` (be.md §5.1 bước 5, item 4 "critical
 * facts" của tác vụ p1-04: bản THAY THẾ TỐI GIẢN chỉ kiểm CẤU TRÚC — không
 * kiểm membership thật, việc đó uỷ quyền cho `MessageScope.validateMentions()`
 * (tested ở tầng adapter CHANNEL/integration, xem `channel-message-scope
 * .adapter.ts`). Hàm thuần, không cần Prisma/Redis thật.
 */
import { validateMentionsStructurally } from "../services/mention-validator";
import type { MentionInputDto } from "../dtos/send-message.dto";

const VALID_ID_1 = "507f1f77bcf86cd799439011";
const VALID_ID_2 = "507f1f77bcf86cd799439012";
const BAD_ID = "not-an-object-id";

describe("mention-validator#validateMentionsStructurally()", () => {
  it("mảng rỗng → valid, mentions rỗng", () => {
    expect(validateMentionsStructurally([])).toEqual({ valid: true, mentions: [] });
  });

  it("USER với ObjectId hợp lệ → valid, chuẩn hoá label:null", () => {
    const input: MentionInputDto[] = [{ type: "USER", targetId: VALID_ID_1 }];
    expect(validateMentionsStructurally(input)).toEqual({
      valid: true,
      mentions: [{ type: "USER", targetId: VALID_ID_1, label: null }],
    });
  });

  it("USER với targetId sai định dạng ObjectId → invalid", () => {
    const input: MentionInputDto[] = [{ type: "USER", targetId: BAD_ID }];
    const result = validateMentionsStructurally(input);
    expect(result.valid).toBe(false);
    expect(result.invalidMentions).toEqual([{ type: "USER", targetId: BAD_ID }]);
  });

  it("USER thiếu targetId → invalid", () => {
    const input: MentionInputDto[] = [{ type: "USER" }];
    const result = validateMentionsStructurally(input);
    expect(result.valid).toBe(false);
    expect(result.invalidMentions).toEqual([{ type: "USER" }]);
  });

  it("ROLE với targetId hợp lệ → valid (không kiểm role có tồn tại)", () => {
    const input: MentionInputDto[] = [{ type: "ROLE", targetId: VALID_ID_1 }];
    expect(validateMentionsStructurally(input)).toEqual({
      valid: true,
      mentions: [{ type: "ROLE", targetId: VALID_ID_1, label: null }],
    });
  });

  it("ROLE thiếu targetId → invalid", () => {
    const input: MentionInputDto[] = [{ type: "ROLE" }];
    const result = validateMentionsStructurally(input);
    expect(result.valid).toBe(false);
  });

  it("ALL không cần targetId → valid", () => {
    const input: MentionInputDto[] = [{ type: "ALL" }];
    expect(validateMentionsStructurally(input)).toEqual({
      valid: true,
      mentions: [{ type: "ALL", targetId: null, label: null }],
    });
  });

  it("trùng cặp (type, targetId) → invalid, invalidMentions chỉ chứa bản trùng (không chứa bản gốc)", () => {
    const input: MentionInputDto[] = [
      { type: "USER", targetId: VALID_ID_1 },
      { type: "USER", targetId: VALID_ID_1 },
    ];
    const result = validateMentionsStructurally(input);
    expect(result.valid).toBe(false);
    expect(result.mentions).toEqual([]);
    expect(result.invalidMentions).toEqual([{ type: "USER", targetId: VALID_ID_1 }]);
  });

  it("trộn hợp lệ + không hợp lệ → invalid tổng thể, mentions rỗng, invalidMentions chỉ chứa phần tử sai", () => {
    const input: MentionInputDto[] = [
      { type: "USER", targetId: VALID_ID_1 },
      { type: "USER", targetId: BAD_ID },
      { type: "ALL" },
    ];
    const result = validateMentionsStructurally(input);
    expect(result.valid).toBe(false);
    expect(result.mentions).toEqual([]);
    expect(result.invalidMentions).toEqual([{ type: "USER", targetId: BAD_ID }]);
  });

  it("vượt quá mentionsMax (20) → invalid ngay, invalidMentions = toàn bộ mảng gốc", () => {
    const input: MentionInputDto[] = Array.from({ length: 21 }, () => ({ type: "ALL" as const }));
    const result = validateMentionsStructurally(input);
    expect(result.valid).toBe(false);
    expect(result.mentions).toEqual([]);
    expect(result.invalidMentions).toHaveLength(21);
  });

  it("nhiều mention hợp lệ khác targetId → giữ đúng thứ tự, không bị coi là trùng", () => {
    const input: MentionInputDto[] = [
      { type: "USER", targetId: VALID_ID_1 },
      { type: "USER", targetId: VALID_ID_2 },
    ];
    const result = validateMentionsStructurally(input);
    expect(result.valid).toBe(true);
    expect(result.mentions).toEqual([
      { type: "USER", targetId: VALID_ID_1, label: null },
      { type: "USER", targetId: VALID_ID_2, label: null },
    ]);
  });
});
