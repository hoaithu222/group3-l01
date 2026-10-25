import { buildAdminOverview } from "../admin-overview.service";

const mockUserCount = jest.fn();
const mockSessionFindMany = jest.fn();

// Cờ phân hệ tắt hết: `activeWorkspaces`/`openReports` chỉ đếm khi cờ `communication` bật (không mock `workspace`/`report` ở prisma bên dưới).
jest.mock("../../../core/config/runtime-config", () => ({
  runtimeConfig: { isFeatureEnabled: jest.fn().mockResolvedValue(false) },
}));

jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    user: { count: (...args: unknown[]) => mockUserCount(...args) },
    session: { findMany: (...args: unknown[]) => mockSessionFindMany(...args) },
  },
}));

describe("buildAdminOverview", () => {
  beforeEach(() => {
    mockUserCount.mockReset();
    mockSessionFindMany.mockReset();
  });

  it("trả newUsers7d từ prisma.user.count; activeWorkspaces/openReports = 0 khi cờ communication tắt; failedAiJobs24h = 0 (AI tạm dừng D-13)", async () => {
    mockUserCount.mockResolvedValue(5);
    mockSessionFindMany.mockResolvedValue([]);

    const overview = await buildAdminOverview("7d");

    expect(overview.newUsers7d).toBe(5);
    expect(overview.activeWorkspaces).toBe(0);
    expect(overview.openReports).toBe(0);
    expect(overview.failedAiJobs24h).toBe(0);
    expect(overview.activeUsersSeries).toHaveLength(7);
    expect(overview.activeUsersSeries.every((p) => p.count === 0)).toBe(true);
  });

  it("activeUsersSeries đếm số user KHÁC NHAU theo ngày (không đếm trùng cùng ngày)", async () => {
    mockUserCount.mockResolvedValue(0);
    const today = new Date();
    mockSessionFindMany.mockResolvedValue([
      { userId: "u1", lastUsedAt: today },
      { userId: "u1", lastUsedAt: today },
      { userId: "u2", lastUsedAt: today },
    ]);

    const overview = await buildAdminOverview("7d");
    const todayKey = today.toISOString().slice(0, 10);
    const point = overview.activeUsersSeries.find((p) => p.date === todayKey);

    expect(point?.count).toBe(2);
  });
});
