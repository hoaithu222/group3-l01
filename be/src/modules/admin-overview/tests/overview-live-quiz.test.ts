import { buildAdminOverview } from "../admin-overview.service";

/**
 * p5-01 admin.md §2.3: `liveQuizActive` của `GET /admin/overview` = số phiên `IN_PROGRESS`, CHỈ có khi cờ `live-quiz` bật.
 * Vắng khi cờ tắt (dashboard ẩn thẻ) hoặc khi đọc cờ/đếm lỗi (không kéo cả dashboard xuống).
 */
const mockUserCount = jest.fn();
const mockSessionFindMany = jest.fn();
const mockQuizCount = jest.fn();
const mockIsFeatureEnabled = jest.fn();

jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    user: { count: (...args: unknown[]) => mockUserCount(...args) },
    session: { findMany: (...args: unknown[]) => mockSessionFindMany(...args) },
    liveQuizSession: { count: (...args: unknown[]) => mockQuizCount(...args) },
  },
}));
jest.mock("../../../core/config/runtime-config", () => ({
  runtimeConfig: { isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...args) },
}));

const flags = (enabled: Partial<Record<"live-quiz" | "meeting" | "voice", boolean>>) =>
  mockIsFeatureEnabled.mockImplementation((m: string) => Promise.resolve(enabled[m as "live-quiz"] ?? false));

describe("buildAdminOverview — KPI phiên live quiz đang chạy (p5-01)", () => {
  beforeEach(() => {
    mockUserCount.mockResolvedValue(0);
    mockSessionFindMany.mockResolvedValue([]);
    mockQuizCount.mockResolvedValue(4);
  });

  it("cờ live-quiz bật → có liveQuizActive, đếm đúng phiên IN_PROGRESS (không tính phòng chờ WAITING)", async () => {
    flags({ "live-quiz": true });
    const overview = await buildAdminOverview("7d");

    expect(overview.liveQuizActive).toBe(4);
    expect(mockQuizCount).toHaveBeenCalledWith({ where: { status: "IN_PROGRESS" } });
  });

  it("0 phiên vẫn là số 0 (thẻ hiện '0', khác với vắng trường = ẩn thẻ)", async () => {
    flags({ "live-quiz": true });
    mockQuizCount.mockResolvedValue(0);
    const overview = await buildAdminOverview("7d");

    expect("liveQuizActive" in overview).toBe(true);
    expect(overview.liveQuizActive).toBe(0);
  });

  it("cờ live-quiz tắt → KHÔNG có trường và không truy vấn DB", async () => {
    flags({ meeting: true, voice: true });
    const overview = await buildAdminOverview("7d");

    expect("liveQuizActive" in overview).toBe(false);
    expect(mockQuizCount).not.toHaveBeenCalled();
  });

  it("đọc cờ lỗi hoặc đếm lỗi → bỏ trường, phần còn lại của dashboard vẫn trả", async () => {
    mockIsFeatureEnabled.mockRejectedValue(new Error("cfg"));
    const flagFailure = await buildAdminOverview("7d");
    expect("liveQuizActive" in flagFailure).toBe(false);
    expect(flagFailure.activeUsersSeries).toHaveLength(7);

    flags({ "live-quiz": true });
    mockQuizCount.mockRejectedValue(new Error("db"));
    const countFailure = await buildAdminOverview("7d");
    expect("liveQuizActive" in countFailure).toBe(false);
    expect(countFailure.activeUsersSeries).toHaveLength(7);
  });

  it("chỉ là số đếm: không PIN/id/tên phiên trong kết quả", async () => {
    flags({ "live-quiz": true });
    const overview = await buildAdminOverview("7d");
    expect(typeof overview.liveQuizActive).toBe("number");
    expect(JSON.stringify(overview)).not.toMatch(/"pin"|setTitle|hostId/i);
  });
});
