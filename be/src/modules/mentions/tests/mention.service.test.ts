/**
 * Unit — `MentionService.validate()` (be.md §5.2, §10 "Unit MentionService"):
 * MISMATCH (TH-05), TOO_MANY, NO_ACCESS (kênh private — qua hook
 * `MessageScope.validateMentions`), NOT_FOUND, tự tag, `@all` theo vai trò +
 * rate limit (MSG-32), `@role` (p3-04: uỷ quyền `RoleMentionPolicy`, test riêng ở `role-mention.policy.test.ts`),
 * trùng tên (MSG-34), `textForSearch`.
 * Mock Prisma/Redis/registry scope — không cần Mongo/Redis thật. (Diff sửa tin
 * MSG-33 do `message.service.ts#edit()` tính — test ở
 * `messages/tests/message.service.thread-mention.test.ts`.)
 */
const mockUserFindMany = jest.fn();
const mockConversationFindUnique = jest.fn();
const mockMemberFindUnique = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    conversation: { findUnique: (...args: unknown[]) => mockConversationFindUnique(...args) },
    conversationMember: { findUnique: (...args: unknown[]) => mockMemberFindUnique(...args) },
  },
}));

const mockIncr = jest.fn();
const mockExpire = jest.fn();
jest.mock("../../../infrastructure/redis", () => ({
  redis: {
    incr: (...args: unknown[]) => mockIncr(...args),
    expire: (...args: unknown[]) => mockExpire(...args),
  },
}));

const mockGetMessageScope = jest.fn();
jest.mock("../../messages/public", () => ({
  getMessageScope: (...args: unknown[]) => mockGetMessageScope(...args),
}));

import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import type { MentionValidateInput } from "../../../core/permission";
import { MentionService } from "../mention.service";
import type { RoleMentionPolicy } from "../role-mention.policy";

const ACTOR = "aaaaaaaaaaaaaaaaaaaaaaaa";
const MINH_1 = "bbbbbbbbbbbbbbbbbbbbbbbb";
const MINH_2 = "cccccccccccccccccccccccc";
const LAN = "dddddddddddddddddddddddd";
const CONV = "eeeeeeeeeeeeeeeeeeeeeeee";
const CHANNEL = "ffffffffffffffffffffffff";

const marker = (id: string) => `@{u:${id}}`;

function userInput(over: Partial<MentionValidateInput> = {}): MentionValidateInput {
  return { scopeType: "CHANNEL", scopeId: CHANNEL, mentions: [], content: "", actorId: ACTOR, ...over };
}

async function catchAppError(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error("Mong đợi ném AppError nhưng không ném gì");
}

function usersInDb(list: Array<{ id: string; name: string; status?: string }>): void {
  mockUserFindMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
    list.filter((u) => args.where.id.in.includes(u.id)).map((u) => ({ status: "ACTIVE", ...u }))
  );
}

function groupConversation(mentionAllRole?: "ADMIN" | "MEMBER", kind: "GROUP" | "DIRECT" = "GROUP"): void {
  mockConversationFindUnique.mockResolvedValue({
    kind,
    settings: mentionAllRole ? { mentionAllRole } : {},
  });
}

describe("MentionService.validate()", () => {
  const service = new MentionService();

  beforeEach(() => {
    mockGetMessageScope.mockReturnValue({ validateMentions: undefined }); // mặc định: scope không cài kiểm sâu
    usersInDb([
      { id: ACTOR, name: "Người gửi" },
      { id: MINH_1, name: "Minh" },
      { id: MINH_2, name: "Minh" },
      { id: LAN, name: "Lan" },
    ]);
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(undefined);
  });

  describe("không có mention", () => {
    it("content thường + mentions rỗng → kết quả rỗng, KHÔNG truy vấn user/Redis", async () => {
      const result = await service.validate(userInput({ content: "Xin chào cả nhà" }));
      expect(result).toEqual({ mentions: [], mentionUserIds: [], mentionAll: false, textForSearch: "Xin chào cả nhà" });
      expect(mockUserFindMany).not.toHaveBeenCalled();
      expect(mockIncr).not.toHaveBeenCalled();
    });

    it("marker sai định dạng (@{u:xyz}) là văn bản thường → hợp lệ khi mentions rỗng", async () => {
      const result = await service.validate(userInput({ content: "gõ nhầm @{u:xyz} thôi" }));
      expect(result.mentions).toEqual([]);
      expect(result.textForSearch).toBe("gõ nhầm @{u:xyz} thôi");
    });
  });

  describe("MISMATCH — marker ↔ mentions[] phải 1-1 (TH-05)", () => {
    it("marker trong content KHÔNG có entry trong mentions[] → 400 MSG_008 reason MISMATCH", async () => {
      const err = await catchAppError(() => service.validate(userInput({ content: `Chào ${marker(MINH_1)}`, mentions: [] })));
      expect(err.errorCode).toBe(ErrorCode.MSG_008);
      expect(err.statusCode).toBe(400);
      expect(err.details).toEqual({ reason: "MISMATCH" });
    });

    it("entry trong mentions[] KHÔNG có marker trong content → MISMATCH", async () => {
      const err = await catchAppError(() =>
        service.validate(userInput({ content: "Chào bạn", mentions: [{ type: "USER", targetId: MINH_1 }] }))
      );
      expect(err.details).toEqual({ reason: "MISMATCH" });
    });

    it("marker và entry khác target → MISMATCH (không cho gắn nhầm người)", async () => {
      const err = await catchAppError(() =>
        service.validate(userInput({ content: `Chào ${marker(MINH_1)}`, mentions: [{ type: "USER", targetId: LAN }] }))
      );
      expect(err.details).toEqual({ reason: "MISMATCH" });
    });

    it("mentions[] có 2 entry trùng target → MISMATCH", async () => {
      const err = await catchAppError(() =>
        service.validate(
          userInput({
            content: `${marker(MINH_1)} ${marker(MINH_1)}`,
            mentions: [
              { type: "USER", targetId: MINH_1 },
              { type: "USER", targetId: MINH_1 },
            ],
          })
        )
      );
      expect(err.details).toEqual({ reason: "MISMATCH" });
    });

    it("2 marker cùng target + 1 entry → hợp lệ (đếm theo target khác nhau, không theo số lần xuất hiện)", async () => {
      const result = await service.validate(
        userInput({ content: `${marker(MINH_1)} và ${marker(MINH_1)}`, mentions: [{ type: "USER", targetId: MINH_1 }] })
      );
      expect(result.mentionUserIds).toEqual([MINH_1]);
      expect(result.textForSearch).toBe("@Minh và @Minh");
    });

    it("payload giả: entry trỏ user ngoài kênh nhưng content không chứa marker → MISMATCH TRƯỚC khi chạm kiểm quyền", async () => {
      const validateMentions = jest.fn();
      mockGetMessageScope.mockReturnValue({ validateMentions });
      await catchAppError(() =>
        service.validate(userInput({ content: "không có marker", mentions: [{ type: "USER", targetId: MINH_1 }] }))
      );
      expect(validateMentions).not.toHaveBeenCalled();
    });
  });

  describe("TOO_MANY", () => {
    function manyUsers(n: number): { content: string; mentions: MentionValidateInput["mentions"]; ids: string[] } {
      const ids = Array.from({ length: n }, (_, i) => i.toString(16).padStart(24, "0"));
      return {
        ids,
        content: ids.map(marker).join(" "),
        mentions: ids.map((targetId) => ({ type: "USER" as const, targetId })),
      };
    }

    it(`vượt mentionsMax (${LIMITS.message.mentionsMax}) → 400 MSG_008 reason TOO_MANY`, async () => {
      const { content, mentions } = manyUsers(LIMITS.message.mentionsMax + 1);
      const err = await catchAppError(() => service.validate(userInput({ content, mentions })));
      expect(err.errorCode).toBe(ErrorCode.MSG_008);
      expect(err.details).toEqual({ reason: "TOO_MANY" });
    });

    it("đúng mentionsMax → hợp lệ", async () => {
      const { content, mentions, ids } = manyUsers(LIMITS.message.mentionsMax);
      usersInDb(ids.map((id) => ({ id, name: `U${id.slice(-2)}` })));
      const result = await service.validate(userInput({ content, mentions }));
      expect(result.mentions).toHaveLength(LIMITS.message.mentionsMax);
    });
  });

  describe("USER — target phải đọc được phạm vi (NO_ACCESS) và là tài khoản ACTIVE (NOT_FOUND)", () => {
    it("kênh private: target không có grant → 400 MSG_008 INVALID_TARGET, invalidMentions[{targetId, NO_ACCESS}] (TH-05)", async () => {
      const validateMentions = jest.fn().mockResolvedValue({ valid: false, invalidMentions: [{ type: "USER", targetId: MINH_1 }] });
      mockGetMessageScope.mockReturnValue({ validateMentions });

      const err = await catchAppError(() =>
        service.validate(userInput({ content: `Chào ${marker(MINH_1)}`, mentions: [{ type: "USER", targetId: MINH_1 }] }))
      );
      expect(err.errorCode).toBe(ErrorCode.MSG_008);
      expect(err.statusCode).toBe(400);
      expect(err.details).toEqual({ reason: "INVALID_TARGET", invalidMentions: [{ targetId: MINH_1, reason: "NO_ACCESS" }] });
      expect(mockGetMessageScope).toHaveBeenCalledWith("CHANNEL");
      expect(validateMentions).toHaveBeenCalledWith(CHANNEL, [{ type: "USER", targetId: MINH_1 }]);
    });

    it("chỉ mention USER mới được gửi vào hook kiểm sâu (ALL không đi qua đó)", async () => {
      const validateMentions = jest.fn().mockResolvedValue({ valid: true });
      mockGetMessageScope.mockReturnValue({ validateMentions });
      groupConversation("MEMBER");
      mockMemberFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });

      await service.validate(
        userInput({
          scopeType: "CONVERSATION",
          scopeId: CONV,
          content: `${marker(LAN)} @{all}`,
          mentions: [{ type: "USER", targetId: LAN }, { type: "ALL" }],
        })
      );
      expect(validateMentions).toHaveBeenCalledWith(CONV, [{ type: "USER", targetId: LAN }]);
    });

    it("scope không cài validateMentions → chỉ kiểm cấu trúc, vẫn hợp lệ", async () => {
      mockGetMessageScope.mockReturnValue({});
      const result = await service.validate(
        userInput({ content: marker(LAN), mentions: [{ type: "USER", targetId: LAN }] })
      );
      expect(result.mentionUserIds).toEqual([LAN]);
    });

    it("user không tồn tại trong DB → 400 MSG_008 INVALID_TARGET reason NOT_FOUND", async () => {
      usersInDb([]);
      const err = await catchAppError(() =>
        service.validate(userInput({ content: marker(LAN), mentions: [{ type: "USER", targetId: LAN }] }))
      );
      expect(err.details).toEqual({ reason: "INVALID_TARGET", invalidMentions: [{ targetId: LAN, reason: "NOT_FOUND" }] });
    });

    it("tài khoản không ACTIVE (LOCKED) → NOT_FOUND, KHÔNG tiêu lượt @all của người gửi", async () => {
      usersInDb([{ id: LAN, name: "Lan", status: "LOCKED" }]);
      const err = await catchAppError(() =>
        service.validate(
          userInput({
            scopeType: "CONVERSATION",
            scopeId: CONV,
            content: `${marker(LAN)} @{all}`,
            mentions: [{ type: "USER", targetId: LAN }, { type: "ALL" }],
          })
        )
      );
      expect(err.details).toMatchObject({ reason: "INVALID_TARGET" });
      expect(mockIncr).not.toHaveBeenCalled();
    });
  });

  describe("kết quả — label, tự tag, textForSearch", () => {
    it("label = tên hiện tại của user (ảnh chụp lúc gửi); textForSearch thay marker bằng @label", async () => {
      const result = await service.validate(
        userInput({ content: `Chào ${marker(LAN)}!`, mentions: [{ type: "USER", targetId: LAN }] })
      );
      expect(result.mentions).toEqual([{ type: "USER", targetId: LAN, label: "Lan" }]);
      expect(result.textForSearch).toBe("Chào @Lan!");
      expect(result.mentionAll).toBe(false);
    });

    it("tự tag chính mình: giữ trong mentions[] nhưng LOẠI khỏi mentionUserIds (không tạo thông báo)", async () => {
      const result = await service.validate(
        userInput({
          content: `${marker(ACTOR)} ${marker(LAN)}`,
          mentions: [{ type: "USER", targetId: ACTOR }, { type: "USER", targetId: LAN }],
        })
      );
      expect(result.mentions.map((m) => m.targetId)).toEqual([ACTOR, LAN]);
      expect(result.mentionUserIds).toEqual([LAN]);
    });

    it("MSG-34: 2 người cùng tên 'Minh', tag MỘT người → chỉ đúng id đó được báo (tra theo id, không theo tên)", async () => {
      const result = await service.validate(
        userInput({ content: `Nhờ ${marker(MINH_2)} xem giúp`, mentions: [{ type: "USER", targetId: MINH_2 }] })
      );
      expect(result.mentionUserIds).toEqual([MINH_2]);
      expect(result.mentions).toEqual([{ type: "USER", targetId: MINH_2, label: "Minh" }]);
      expect(mockUserFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [MINH_2] } } }));
    });

    it("tag cả 2 người trùng tên → 2 entry riêng, 2 id riêng", async () => {
      const result = await service.validate(
        userInput({
          content: `${marker(MINH_1)} ${marker(MINH_2)}`,
          mentions: [{ type: "USER", targetId: MINH_1 }, { type: "USER", targetId: MINH_2 }],
        })
      );
      expect(result.mentionUserIds.sort()).toEqual([MINH_1, MINH_2].sort());
      expect(result.textForSearch).toBe("@Minh @Minh");
    });
  });

  describe("@all — chỉ nhóm chat, vai trò ≥ settings.mentionAllRole, rate limit (MSG-32)", () => {
    const allInput = (over: Partial<MentionValidateInput> = {}): MentionValidateInput =>
      userInput({ scopeType: "CONVERSATION", scopeId: CONV, content: "Chú ý @{all}", mentions: [{ type: "ALL" }], ...over });

    it("ở KÊNH → 403 MSG_020 (P0 chưa có @everyone), không đụng Prisma/Redis", async () => {
      const err = await catchAppError(() => service.validate(userInput({ content: "@{all}", mentions: [{ type: "ALL" }] })));
      expect(err.errorCode).toBe(ErrorCode.MSG_020);
      expect(err.statusCode).toBe(403);
      expect(mockConversationFindUnique).not.toHaveBeenCalled();
      expect(mockIncr).not.toHaveBeenCalled();
    });

    it("hội thoại DIRECT → 403 MSG_020 (vô nghĩa)", async () => {
      groupConversation("MEMBER", "DIRECT");
      const err = await catchAppError(() => service.validate(allInput()));
      expect(err.errorCode).toBe(ErrorCode.MSG_020);
      expect(mockMemberFindUnique).not.toHaveBeenCalled();
    });

    it("hội thoại không tồn tại → 403 MSG_020", async () => {
      mockConversationFindUnique.mockResolvedValue(null);
      const err = await catchAppError(() => service.validate(allInput()));
      expect(err.errorCode).toBe(ErrorCode.MSG_020);
    });

    it("MEMBER khi mentionAllRole=ADMIN → 403 MSG_020, KHÔNG tiêu quota", async () => {
      groupConversation("ADMIN");
      mockMemberFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });
      const err = await catchAppError(() => service.validate(allInput()));
      expect(err.errorCode).toBe(ErrorCode.MSG_020);
      expect(mockIncr).not.toHaveBeenCalled();
    });

    it("settings không khai mentionAllRole → mặc định ADMIN: MEMBER bị chặn, ADMIN được", async () => {
      groupConversation(undefined);
      mockMemberFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });
      await expect(service.validate(allInput())).rejects.toMatchObject({ errorCode: ErrorCode.MSG_020 });

      mockMemberFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
      await expect(service.validate(allInput())).resolves.toMatchObject({ mentionAll: true });
    });

    it("mentionAllRole=MEMBER → MEMBER được dùng @all", async () => {
      groupConversation("MEMBER");
      mockMemberFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });
      const result = await service.validate(allInput());
      expect(result.mentionAll).toBe(true);
      expect(result.mentions).toEqual([{ type: "ALL", targetId: null, label: null }]);
      expect(result.textForSearch).toBe("Chú ý @tất cả");
      expect(result.mentionUserIds).toEqual([]);
    });

    it("OWNER luôn đủ bậc; thành viên đã rời (status LEFT) hoặc không phải member → MSG_020", async () => {
      groupConversation("ADMIN");
      mockMemberFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
      await expect(service.validate(allInput())).resolves.toMatchObject({ mentionAll: true });

      mockMemberFindUnique.mockResolvedValue({ role: "OWNER", status: "LEFT" });
      await expect(service.validate(allInput())).rejects.toMatchObject({ errorCode: ErrorCode.MSG_020 });

      mockMemberFindUnique.mockResolvedValue(null);
      await expect(service.validate(allInput())).rejects.toMatchObject({ errorCode: ErrorCode.MSG_020 });
    });

    it(`rate limit: ${LIMITS.mention.allPerHour} lần/giờ/người/nhóm qua khoá mention-all:<actor>:<conv>; lần thứ ${LIMITS.mention.allPerHour + 1} → 429 MSG_021`, async () => {
      groupConversation("ADMIN");
      mockMemberFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });

      for (let count = 1; count <= LIMITS.mention.allPerHour; count += 1) {
        mockIncr.mockResolvedValueOnce(count);
        await expect(service.validate(allInput())).resolves.toMatchObject({ mentionAll: true });
      }
      expect(mockIncr).toHaveBeenCalledWith(`mention-all:${ACTOR}:${CONV}`);

      mockIncr.mockResolvedValueOnce(LIMITS.mention.allPerHour + 1);
      const err = await catchAppError(() => service.validate(allInput()));
      expect(err.errorCode).toBe(ErrorCode.MSG_021);
      expect(err.statusCode).toBe(429);
      expect(err.details).toEqual({ retryAfterSeconds: 3600 });
    });

    it("chỉ đặt TTL 1 giờ ở lần đếm đầu tiên (count === 1)", async () => {
      groupConversation("ADMIN");
      mockMemberFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });

      mockIncr.mockResolvedValueOnce(1);
      await service.validate(allInput());
      expect(mockExpire).toHaveBeenCalledWith(`mention-all:${ACTOR}:${CONV}`, 3600);

      mockExpire.mockClear();
      mockIncr.mockResolvedValueOnce(2);
      await service.validate(allInput());
      expect(mockExpire).not.toHaveBeenCalled();
    });

    it("Redis lỗi (incr trả null) → fail-open, không chặn @all", async () => {
      groupConversation("ADMIN");
      mockMemberFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
      mockIncr.mockResolvedValue(null);
      await expect(service.validate(allInput())).resolves.toMatchObject({ mentionAll: true });
      expect(mockExpire).not.toHaveBeenCalled();
    });

    it("USER + ALL cùng tin: hợp lệ, mentionUserIds chỉ có USER", async () => {
      groupConversation("ADMIN");
      mockMemberFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
      const result = await service.validate(
        allInput({ content: `${marker(LAN)} @{all}`, mentions: [{ type: "USER", targetId: LAN }, { type: "ALL" }] })
      );
      expect(result.mentionAll).toBe(true);
      expect(result.mentionUserIds).toEqual([LAN]);
      expect(result.textForSearch).toBe("@Lan @tất cả");
    });
  });

  describe("@role (p3-04) — uỷ quyền RoleMentionPolicy", () => {
    const assertAllowed = jest.fn();
    const roleService = new MentionService({ assertAllowed } as unknown as RoleMentionPolicy);

    beforeEach(() => assertAllowed.mockReset().mockResolvedValue(undefined));

    it("@{r:ADMIN} hợp lệ → mentions có label 'Quản trị viên', textForSearch thay marker bằng nhãn, KHÔNG thêm người nhận cá nhân", async () => {
      const result = await roleService.validate(
        userInput({ content: "@{r:ADMIN} vào họp", mentions: [{ type: "ROLE", targetId: "ADMIN" }] })
      );
      expect(result.mentions).toEqual([{ type: "ROLE", targetId: "ADMIN", label: "Quản trị viên" }]);
      expect(result.textForSearch).toBe("@Quản trị viên vào họp");
      expect(result.mentionUserIds).toEqual([]);
      expect(result.mentionAll).toBe(false);
    });

    it("chuyển scope/actor/messageId/mentions cho policy (messageId chỉ khi sửa tin)", async () => {
      const mentions = [{ type: "ROLE" as const, targetId: "MEMBER" }];
      await roleService.validate(userInput({ content: "@{r:MEMBER}", mentions, messageId: "m".repeat(24) }));
      expect(assertAllowed).toHaveBeenCalledWith({
        scopeType: "CHANNEL",
        scopeId: CHANNEL,
        actorId: ACTOR,
        messageId: "m".repeat(24),
        mentions,
      });
    });

    it("policy từ chối (403/429/400) → lỗi lan ra nguyên vẹn, không trả kết quả", async () => {
      assertAllowed.mockRejectedValue(new AppError("Vượt hạn mức", 429, ErrorCode.RATE_003));
      const err = await catchAppError(() =>
        roleService.validate(userInput({ content: "@{r:ADMIN}", mentions: [{ type: "ROLE", targetId: "ADMIN" }] }))
      );
      expect(err.errorCode).toBe(ErrorCode.RATE_003);
      expect(err.statusCode).toBe(429);
    });

    it("marker @{r:ADMIN} không có trong mentions[] → MISMATCH (kiểm 1-1 áp dụng cả vai trò)", async () => {
      const err = await catchAppError(() => roleService.validate(userInput({ content: "@{r:ADMIN} ơi", mentions: [] })));
      expect(err.errorCode).toBe(ErrorCode.MSG_008);
      expect(err.details).toEqual({ reason: "MISMATCH" });
      expect(assertAllowed).not.toHaveBeenCalled();
    });
  });
});
