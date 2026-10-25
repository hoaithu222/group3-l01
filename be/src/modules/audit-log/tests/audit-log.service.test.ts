import { AuditService } from "../audit-log.service";

const mockCreate = jest.fn();
const mockFindMany = jest.fn();
const mockUserFindMany = jest.fn();

jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    auditLog: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
  },
}));

/** Đối số của lần gọi `prisma.user.findMany` đầu tiên (mock.calls không có kiểu). */
function firstUserQuery(): {
  where: { id: { in: string[] } };
  select: Record<string, boolean>;
} {
  const calls = mockUserFindMany.mock.calls as unknown[][];
  return calls[0]?.[0] as ReturnType<typeof firstUserQuery>;
}

function auditRow(id: string, actorId: string, at = new Date()) {
  return {
    id,
    actorId,
    actorRole: "admin",
    action: "user.lock",
    targetType: "User",
    targetId: "t",
    workspaceId: null,
    reason: null,
    metadata: null,
    ip: null,
    userAgent: null,
    at,
  };
}

describe("AuditService", () => {
  let service: AuditService;

  beforeEach(() => {
    service = new AuditService();
    mockCreate.mockReset();
    mockFindMany.mockReset();
    mockUserFindMany.mockReset();
    mockUserFindMany.mockResolvedValue([]);
  });

  it("record() ghi audit log qua prisma.auditLog.create", async () => {
    mockCreate.mockResolvedValue({ id: "1" });
    await service.record({
      actorId: "actor-1",
      action: "user.lock",
      targetType: "User",
      targetId: "target-1",
      reason: "Vi phạm điều khoản",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: "actor-1", action: "user.lock" }),
      })
    );
  });

  it("record() KHÔNG ném lỗi ra ngoài khi prisma thất bại", async () => {
    mockCreate.mockRejectedValue(new Error("DB down"));
    await expect(
      service.record({ actorId: "a", action: "x", targetType: "User", targetId: "t" })
    ).resolves.not.toThrow();
  });

  it("list() trả nextCursor khi còn dữ liệu, null khi hết", async () => {
    const now = new Date();
    mockFindMany.mockResolvedValueOnce(
      Array.from({ length: 3 }, (_, i) => ({
        id: `id-${i}`,
        actorId: "a",
        actorRole: "admin",
        action: "user.lock",
        targetType: "User",
        targetId: "t",
        workspaceId: null,
        reason: null,
        metadata: null,
        ip: null,
        userAgent: null,
        at: now,
      }))
    );
    const result = await service.list({ limit: 2 });
    expect(result.data).toHaveLength(2);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.nextCursor).not.toBeNull();

    mockFindMany.mockResolvedValueOnce([]);
    const empty = await service.list({ limit: 2 });
    expect(empty.meta.hasMore).toBe(false);
    expect(empty.meta.nextCursor).toBeNull();
  });

  describe("list() — lọc action", () => {
    /** `where` của lần gọi `prisma.auditLog.findMany` đầu tiên. */
    function firstWhere(): Record<string, unknown> {
      const calls = mockFindMany.mock.calls as unknown[][];
      return (calls[0]?.[0] as { where: Record<string, unknown> }).where;
    }

    beforeEach(() => mockFindMany.mockResolvedValue([]));

    it("1 mã → so khớp bằng", async () => {
      await service.list({ limit: 10, action: "user.lock" });
      expect(firstWhere().action).toBe("user.lock");
    });

    it("mảng 1 phần tử → so khớp bằng", async () => {
      await service.list({ limit: 10, action: ["user.lock"] });
      expect(firstWhere().action).toBe("user.lock");
    });

    it("nhiều mã → lọc IN", async () => {
      await service.list({ limit: 10, action: ["user.lock", "user.unlock"] });
      expect(firstWhere().action).toEqual({ in: ["user.lock", "user.unlock"] });
    });

    it("không truyền / mảng rỗng → KHÔNG lọc theo action", async () => {
      await service.list({ limit: 10 });
      expect(firstWhere()).not.toHaveProperty("action");
      mockFindMany.mockClear();
      await service.list({ limit: 10, action: [] });
      expect(firstWhere()).not.toHaveProperty("action");
    });
  });

  describe("list() — actor", () => {
    it("gắn actor { id, name, role } và GIỮ NGUYÊN mọi trường cũ", async () => {
      mockFindMany.mockResolvedValueOnce([auditRow("a1", "u-1")]);
      mockUserFindMany.mockResolvedValueOnce([{ id: "u-1", name: "Nguyễn Văn An", role: "admin" }]);

      const result = await service.list({ limit: 10 });

      expect(result.data[0]).toMatchObject({
        id: "a1",
        actorId: "u-1",
        actorRole: "admin",
        action: "user.lock",
        targetType: "User",
        targetId: "t",
        at: expect.any(Date),
        actor: { id: "u-1", name: "Nguyễn Văn An", role: "admin" },
      });
    });

    it("actor = null khi user không còn tồn tại (xoá cứng)", async () => {
      mockFindMany.mockResolvedValueOnce([auditRow("a1", "u-gone")]);
      mockUserFindMany.mockResolvedValueOnce([]);

      const result = await service.list({ limit: 10 });

      expect(result.data[0]?.actor).toBeNull();
      expect(result.data[0]?.actorId).toBe("u-gone");
    });

    it("tài khoản đã ẩn danh hoá vẫn có actor với tên đã che", async () => {
      mockFindMany.mockResolvedValueOnce([auditRow("a1", "u-anon")]);
      mockUserFindMany.mockResolvedValueOnce([
        { id: "u-anon", name: "Tài khoản đã xoá", role: "user" },
      ]);

      const result = await service.list({ limit: 10 });

      expect(result.data[0]?.actor).toEqual({
        id: "u-anon",
        name: "Tài khoản đã xoá",
        role: "user",
      });
    });

    it("chỉ MỘT truy vấn user cho cả trang (không N+1), id trùng được gộp", async () => {
      mockFindMany.mockResolvedValueOnce([
        auditRow("a1", "u-1"),
        auditRow("a2", "u-2"),
        auditRow("a3", "u-1"),
        auditRow("a4", "u-2"),
      ]);
      mockUserFindMany.mockResolvedValueOnce([
        { id: "u-1", name: "An", role: "admin" },
        { id: "u-2", name: "Bình", role: "manager" },
      ]);

      const result = await service.list({ limit: 10 });

      expect(mockUserFindMany).toHaveBeenCalledTimes(1);
      expect(firstUserQuery().where.id.in.sort()).toEqual(["u-1", "u-2"]);
      expect(result.data.map((r) => r.actor?.name)).toEqual(["An", "Bình", "An", "Bình"]);
    });

    it("chỉ select trường an toàn — KHÔNG lộ email/passwordHash", async () => {
      mockFindMany.mockResolvedValueOnce([auditRow("a1", "u-1")]);

      await service.list({ limit: 10 });

      expect(firstUserQuery().select).toEqual({ id: true, name: true, role: true });
    });

    it("chỉ tra actor của bản ghi TRONG trang (bản ghi dư để dò hasMore bị bỏ)", async () => {
      mockFindMany.mockResolvedValueOnce([
        auditRow("a1", "u-1"),
        auditRow("a2", "u-2"),
        auditRow("a3", "u-extra"),
      ]);
      mockUserFindMany.mockResolvedValueOnce([]);

      const result = await service.list({ limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(firstUserQuery().where.id.in).not.toContain("u-extra");
    });

    it("trang rỗng thì KHÔNG truy vấn user", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await service.list({ limit: 10 });

      expect(result.data).toEqual([]);
      expect(mockUserFindMany).not.toHaveBeenCalled();
    });
  });
});
