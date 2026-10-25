import type { IProjectStatsRepository } from "../repositories/project-stats.repository.interface";
import { AdminProjectStatsService, weekStartUtc } from "../services/admin-project-stats.service";

const stub = (completed: Date[], exists = true): IProjectStatsRepository => ({
  workspaceExists: async () => exists,
  listBoards: async () => [],
  countByBoardAndKind: async () => [],
  countOverdue: async () => 0,
  completedSince: async (_ws, since) => completed.filter((d) => d >= since),
});

describe("admin project-stats — bucket tuần/30 ngày", () => {
  it("weekStartUtc: thứ Hai 00:00 UTC; Chủ nhật 23:59 vẫn thuộc tuần trước", () => {
    expect(weekStartUtc(new Date("2026-09-14T00:00:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z"); // thứ Hai
    expect(weekStartUtc(new Date("2026-09-20T23:59:59Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z"); // Chủ nhật
    expect(weekStartUtc(new Date("2026-09-21T00:00:00Z")).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("8 bucket liên tiếp kết thúc ở tuần hiện tại; đếm đúng theo tuần; done30d lọc theo 30 ngày", async () => {
    const now = new Date("2026-09-19T10:00:00Z"); // thứ Bảy, tuần bắt đầu 2026-09-14
    const service = new AdminProjectStatsService(
      stub([
        new Date("2026-09-19T01:00:00Z"), // tuần này
        new Date("2026-09-14T00:00:00Z"), // tuần này (biên)
        new Date("2026-09-13T23:59:59Z"), // tuần trước
        new Date("2026-08-01T00:00:00Z"), // 7 tuần trước, ngoài 30 ngày
        new Date("2026-07-01T00:00:00Z"), // ngoài 8 tuần → không được đếm
      ])
    );
    const stats = await service.get("w".repeat(24), now);

    expect(stats.doneByWeek).toHaveLength(8);
    expect(stats.doneByWeek[7]).toEqual({ weekStart: "2026-09-14", count: 2 });
    expect(stats.doneByWeek[6]).toEqual({ weekStart: "2026-09-07", count: 1 });
    expect(stats.doneByWeek[0].weekStart).toBe("2026-07-27");
    expect(stats.doneByWeek.reduce((s, w) => s + w.count, 0)).toBe(4);
    expect(stats.totals.done30d).toBe(3);
  });

  it("nhóm không tồn tại → 404", async () => {
    await expect(new AdminProjectStatsService(stub([], false)).get("w".repeat(24))).rejects.toMatchObject({ statusCode: 404 });
  });
});
