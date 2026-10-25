/**
 * Unit — `RoleMentionPolicy` (p3-04 be.md §5.7, RB-10 phần validator): `@role` chỉ trong KÊNH, `targetId ∈ {ADMIN, MEMBER}`,
 * người gửi phải có `workspace.mention.role`, hạn mức `LIMITS.mention.roleMentionsPerHour` lần/giờ (lần thứ 6 → 429 `RATE_003`),
 * hạn mức CHỈ tính khi tin CÓ mention vai trò, sửa tin không tính lại vai trò đã có. Mock Prisma/Redis/PermissionService.
 */
const mockChannelFindUnique = jest.fn();
const mockMessageFindUnique = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    channel: { findUnique: (...a: unknown[]) => mockChannelFindUnique(...a) },
    message: { findUnique: (...a: unknown[]) => mockMessageFindUnique(...a) },
  },
}));

const mockIncr = jest.fn();
const mockExpire = jest.fn();
jest.mock("../../../infrastructure/redis", () => ({
  redis: { incr: (...a: unknown[]) => mockIncr(...a), expire: (...a: unknown[]) => mockExpire(...a) },
}));

const mockCan = jest.fn();
jest.mock("../../../core/permission", () => ({ permissionService: { can: (...a: unknown[]) => mockCan(...a) } }));

import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import { RoleMentionPolicy, roleMentionLabel } from "../role-mention.policy";

const WS = "a".repeat(24);
const CH = "c".repeat(24);
const ACTOR = "b".repeat(24);
const MSG = "d".repeat(24);
const role = (targetId: string) => ({ type: "ROLE" as const, targetId });
const check = (over: Partial<Parameters<RoleMentionPolicy["assertAllowed"]>[0]> = {}) => ({
  scopeType: "CHANNEL" as const,
  scopeId: CH,
  actorId: ACTOR,
  mentions: [role("ADMIN")],
  ...over,
});

async function appError(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error("Mong đợi ném AppError nhưng không ném gì");
}

describe("RoleMentionPolicy.assertAllowed()", () => {
  const policy = new RoleMentionPolicy();

  beforeEach(() => {
    mockChannelFindUnique.mockResolvedValue({ workspaceId: WS });
    mockCan.mockResolvedValue(true);
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(undefined);
  });

  it("tin KHÔNG có mention vai trò → không kiểm quyền, không tính hạn mức", async () => {
    await policy.assertAllowed(check({ mentions: [{ type: "USER", targetId: "u".repeat(24) }, { type: "ALL" }] }));
    expect(mockCan).not.toHaveBeenCalled();
    expect(mockIncr).not.toHaveBeenCalled();
  });

  it("OWNER/ADMIN (có workspace.mention.role của workspace chứa kênh) → hợp lệ, tính 1 lượt Redis mention-role:<ws>:<actor>", async () => {
    await policy.assertAllowed(check({ mentions: [role("ADMIN"), role("MEMBER")] })); // 2 vai trò trong 1 tin = 1 lượt
    expect(mockCan).toHaveBeenCalledWith({ id: ACTOR, email: "" }, "workspace.mention.role", { type: "WORKSPACE", id: WS });
    expect(mockIncr).toHaveBeenCalledTimes(1);
    expect(mockIncr).toHaveBeenCalledWith(`mention-role:${WS}:${ACTOR}`);
    expect(mockExpire).toHaveBeenCalledWith(`mention-role:${WS}:${ACTOR}`, 3600);
  });

  it("MEMBER/GUEST (thiếu workspace.mention.role) → 403 PERM_006, KHÔNG tiêu hạn mức", async () => {
    mockCan.mockResolvedValue(false);
    const err = await appError(() => policy.assertAllowed(check()));
    expect(err.statusCode).toBe(403);
    expect(err.errorCode).toBe(ErrorCode.PERM_006);
    expect(err.details).toEqual({ reason: "MENTION_ROLE_FORBIDDEN" });
    expect(mockIncr).not.toHaveBeenCalled();
  });

  it("RB-10: lượt thứ 5 trong giờ còn được; lượt thứ 6 → 429 RATE_003 (retryAfterSeconds 3600)", async () => {
    mockIncr.mockResolvedValue(LIMITS.mention.roleMentionsPerHour); // = 5
    await expect(policy.assertAllowed(check())).resolves.toBeUndefined();

    mockIncr.mockResolvedValue(LIMITS.mention.roleMentionsPerHour + 1); // = 6
    const err = await appError(() => policy.assertAllowed(check()));
    expect(err.statusCode).toBe(429);
    expect(err.errorCode).toBe(ErrorCode.RATE_003);
    expect(err.details).toEqual({ retryAfterSeconds: 3600 });
  });

  it("Redis lỗi (INCR trả null) → cho qua (không chặn gửi tin)", async () => {
    mockIncr.mockResolvedValue(null);
    await expect(policy.assertAllowed(check())).resolves.toBeUndefined();
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("hội thoại (không phải kênh) → 400 MSG_008 ROLE_NOT_SUPPORTED, không tra DB", async () => {
    const err = await appError(() => policy.assertAllowed(check({ scopeType: "CONVERSATION" })));
    expect(err.errorCode).toBe(ErrorCode.MSG_008);
    expect(err.details).toEqual({ reason: "ROLE_NOT_SUPPORTED" });
    expect(mockChannelFindUnique).not.toHaveBeenCalled();
  });

  it("targetId không phải ADMIN/MEMBER → 400 MSG_008 INVALID_TARGET (NOT_FOUND)", async () => {
    const err = await appError(() => policy.assertAllowed(check({ mentions: [role("OWNER")] })));
    expect(err.errorCode).toBe(ErrorCode.MSG_008);
    expect(err.details).toEqual({ reason: "INVALID_TARGET", invalidMentions: [{ targetId: "OWNER", reason: "NOT_FOUND" }] });
  });

  it("kênh không tồn tại → 404", async () => {
    mockChannelFindUnique.mockResolvedValue(null);
    await expect(policy.assertAllowed(check())).rejects.toMatchObject({ statusCode: 404 });
  });

  describe("sửa tin (messageId)", () => {
    it("vai trò ĐÃ có trên tin → không kiểm lại quyền, không tính thêm lượt", async () => {
      mockMessageFindUnique.mockResolvedValue({ mentions: [{ type: "ROLE", targetId: null, roleRef: "ADMIN" }] });
      await policy.assertAllowed(check({ messageId: MSG }));
      expect(mockCan).not.toHaveBeenCalled();
      expect(mockIncr).not.toHaveBeenCalled();
    });

    it("thêm vai trò MỚI khi sửa → kiểm quyền + tính 1 lượt", async () => {
      mockMessageFindUnique.mockResolvedValue({ mentions: [{ type: "ROLE", targetId: null, roleRef: "ADMIN" }] });
      await policy.assertAllowed(check({ messageId: MSG, mentions: [role("ADMIN"), role("MEMBER")] }));
      expect(mockCan).toHaveBeenCalledTimes(1);
      expect(mockIncr).toHaveBeenCalledTimes(1);
    });
  });
});

describe("roleMentionLabel()", () => {
  it("ADMIN/MEMBER → nhãn tiếng Việt; giá trị lạ → null", () => {
    expect(roleMentionLabel("ADMIN")).toBe("Quản trị viên");
    expect(roleMentionLabel("MEMBER")).toBe("Thành viên");
    expect(roleMentionLabel("OWNER")).toBeNull();
    expect(roleMentionLabel(null)).toBeNull();
  });
});
