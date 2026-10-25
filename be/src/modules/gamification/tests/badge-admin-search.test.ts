import { NotFoundError } from "../../../core/exceptions";
import { adminBadgesQuerySchema } from "../dtos";
import type { Badge } from "../entities/gamification.interface";
import type { BadgeListParams, IBadgeRepository } from "../repositories/badge.repository.interface";
import type { IGamDirectory } from "../repositories/directory";
import type { IUserBadgeRepository } from "../repositories/user-badge.repository.interface";
import { BadgeAdminService } from "../services/badge-admin.service";
import { GamificationAdminService } from "../services/gamification-admin.service";
import type { GamificationQueryService } from "../services/gamification-query.service";

const at = new Date("2026-09-01T00:00:00Z");
const badge = (over: Partial<Badge> = {}): Badge => ({
  id: "b1",
  code: "tasks-50",
  name: "Chăm chỉ",
  description: "",
  emoji: null,
  iconAssetId: null,
  criteria: { all: [{ counter: "tasksDone", op: "gte", value: 50 }] },
  counters: ["tasksDone"],
  rarity: "COMMON",
  isActive: true,
  order: 0,
  version: 1,
  createdBy: null,
  createdAt: at,
  updatedAt: at,
  ...over,
});

function badgeAdmin(rows: Badge[]) {
  const listPage = jest.fn((_p: BadgeListParams) => Promise.resolve({ rows, total: rows.length }));
  const badges = { listPage, findById: (id: string) => Promise.resolve(rows.find((b) => b.id === id) ?? null) } as unknown as IBadgeRepository;
  const userBadges = { countByBadges: (ids: readonly string[]) => Promise.resolve(new Map(ids.map((id) => [id, 7]))) } as unknown as IUserBadgeRepository;
  const service = new BadgeAdminService({ badges, userBadges, badgeService: {} as never, audit: { record: jest.fn() } as never, jobs: {} as never, icons: {} as never, tx: {} as never });
  return { service, listPage };
}

describe("adminBadgesQuerySchema — tham số tìm `q` (p4-03 admin.md §2.2)", () => {
  it("q được cắt khoảng trắng; thiếu/rỗng = không lọc; quá độ dài tên → lỗi", () => {
    expect(adminBadgesQuerySchema.parse({ q: "  Chăm  " }).q).toBe("Chăm");
    expect(adminBadgesQuerySchema.parse({}).q).toBeUndefined();
    expect(adminBadgesQuerySchema.parse({ q: "   " }).q).toBe("");
    expect(adminBadgesQuerySchema.safeParse({ q: "x".repeat(61) }).success).toBe(false);
  });

  it("giữ nguyên page/limit/isActive như cũ", () => {
    expect(adminBadgesQuerySchema.parse({ page: "2", limit: "10", isActive: "false", q: "a" })).toEqual({ page: 2, limit: 10, isActive: false, q: "a" });
  });
});

describe("BadgeAdminService.list/get — q chuyển xuống repository (lọc TRƯỚC khi phân trang)", () => {
  it("list truyền q cùng page/limit/isActive và trả meta theo tổng đã lọc", async () => {
    const { service, listPage } = badgeAdmin([badge()]);
    const res = await service.list({ page: 1, limit: 20, isActive: true, q: "cham chi" });
    expect(listPage).toHaveBeenCalledWith({ page: 1, limit: 20, isActive: true, q: "cham chi" });
    expect(res.meta).toMatchObject({ total: 1, totalPages: 1, hasNext: false, hasPrev: false });
    expect(res.data[0]).toMatchObject({ id: "b1", unlockedCount: 7 });
  });

  it("get trả huy hiệu kèm unlockedCount; không có → NotFoundError (404)", async () => {
    const { service } = badgeAdmin([badge()]);
    await expect(service.get("b1")).resolves.toMatchObject({ id: "b1", code: "tasks-50", unlockedCount: 7 });
    await expect(service.get("khong-co")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("GamificationAdminService.userOverview — cột Workspace của lịch sử XP", () => {
  const events = [
    { id: "e1", sourceType: "TASK_COMPLETED", xp: 10, capped: false, blockedReason: null, occurredAt: at.toISOString(), workspaceId: "w1" },
    { id: "e2", sourceType: "ADMIN_ADJUST", xp: -5, capped: false, blockedReason: null, occurredAt: at.toISOString(), workspaceId: null },
    { id: "e3", sourceType: "QUIZ_SCORED", xp: 4, capped: false, blockedReason: null, occurredAt: at.toISOString(), workspaceId: "da-xoa" },
  ];

  it("gắn workspaceName cho sự kiện có nhóm; không nhóm/nhóm đã xoá → null; chỉ hỏi tên MỘT lần cho id có mặt", async () => {
    const getWorkspaceNames = jest.fn((ids: readonly string[]) => Promise.resolve(new Map(ids.filter((id) => id === "w1").map((id) => [id, "Nhóm Alpha"]))));
    const directory = { getTimezoneAndStatus: () => Promise.resolve({ timezone: "Asia/Ho_Chi_Minh", status: "ACTIVE" }), getWorkspaceNames } as unknown as IGamDirectory;
    const query = { me: () => Promise.resolve({ level: 3 }), xpEvents: () => Promise.resolve({ data: events, meta: { nextCursor: null, hasMore: false, limit: 20 } }) } as unknown as GamificationQueryService;
    const userBadges = { listByUser: () => Promise.resolve([]) } as unknown as IUserBadgeRepository;
    const badges = { findByIds: () => Promise.resolve([]) } as unknown as IBadgeRepository;

    const res = await new GamificationAdminService({ query, badges, userBadges, directory }).userOverview("u1", { limit: 20 });
    expect(getWorkspaceNames).toHaveBeenCalledWith(["w1", "da-xoa"]);
    expect(res.xpEvents.map((e) => [e.id, e.workspaceId, e.workspaceName])).toEqual([
      ["e1", "w1", "Nhóm Alpha"],
      ["e2", null, null],
      ["e3", "da-xoa", null],
    ]);
  });
});
