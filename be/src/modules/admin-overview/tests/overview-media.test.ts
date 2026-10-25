import { clearAdminOverviewMediaProvider, registerAdminOverviewMediaProvider } from "../../../shared/ports/admin-overview-media.port";
import { buildAdminOverview } from "../admin-overview.service";

/**
 * OPC-11 (p2-07 be.md §10): khối `media` của `GET /admin/overview` CÓ khi provider đã đăng ký và cờ `meeting` hoặc `voice` bật; VẮNG khi cả hai tắt, khi chưa có provider,
 * hoặc khi provider lỗi (không kéo cả dashboard xuống).
 */
const mockUserCount = jest.fn();
const mockSessionFindMany = jest.fn();
const mockIsFeatureEnabled = jest.fn();

jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    user: { count: (...args: unknown[]) => mockUserCount(...args) },
    session: { findMany: (...args: unknown[]) => mockSessionFindMany(...args) },
  },
}));
jest.mock("../../../core/config/runtime-config", () => ({
  runtimeConfig: { isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...args) },
}));

const KPI = { liveMeetings: 3, callsToday: 41, callMinutes7d: 1234, recordingStorageBytes: 5_000_000, egressFailed24h: 1 };

const flags = (enabled: Partial<Record<"meeting" | "voice", boolean>>) =>
  mockIsFeatureEnabled.mockImplementation((m: string) => Promise.resolve(enabled[m as "meeting" | "voice"] ?? false));

describe("buildAdminOverview — KPI gọi & họp (p2-07)", () => {
  beforeEach(() => {
    mockUserCount.mockResolvedValue(0);
    mockSessionFindMany.mockResolvedValue([]);
    registerAdminOverviewMediaProvider({ get: () => Promise.resolve(KPI) });
  });
  afterEach(() => clearAdminOverviewMediaProvider());

  it("cờ meeting bật → có media; chỉ voice bật cũng có", async () => {
    flags({ meeting: true });
    expect((await buildAdminOverview("7d")).media).toEqual(KPI);
    flags({ voice: true });
    expect((await buildAdminOverview("7d")).media).toEqual(KPI);
  });

  it("cả meeting và voice tắt → KHÔNG có trường media (dashboard ẩn khối)", async () => {
    flags({});
    const overview = await buildAdminOverview("7d");
    expect("media" in overview).toBe(false);
  });

  it("chưa đăng ký provider → không có media, không đọc cờ", async () => {
    clearAdminOverviewMediaProvider();
    flags({ meeting: true });
    const overview = await buildAdminOverview("7d");
    expect("media" in overview).toBe(false);
    // Không đọc cờ của khối media (meeting/voice). `live-quiz` do khối KPI khác đọc (`overview-live-quiz.test.ts`) nên không nằm trong ràng buộc này.
    expect(mockIsFeatureEnabled).not.toHaveBeenCalledWith("meeting");
    expect(mockIsFeatureEnabled).not.toHaveBeenCalledWith("voice");
  });

  it("provider ném lỗi / đọc cờ lỗi → bỏ khối media, phần còn lại của dashboard vẫn trả", async () => {
    flags({ meeting: true });
    registerAdminOverviewMediaProvider({ get: () => Promise.reject(new Error("db")) });
    const overview = await buildAdminOverview("7d");
    expect("media" in overview).toBe(false);
    expect(overview.activeUsersSeries).toHaveLength(7);
    mockIsFeatureEnabled.mockRejectedValue(new Error("cfg"));
    registerAdminOverviewMediaProvider({ get: () => Promise.resolve(KPI) });
    expect("media" in (await buildAdminOverview("7d"))).toBe(false);
  });
});
