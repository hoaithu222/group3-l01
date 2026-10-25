import type { AuthUser } from "../../../core/types/express";
import type { GamUser } from "../entities/gamification.interface";
import type { IBadgeRepository } from "../repositories/badge.repository.interface";
import type { IGamDirectory } from "../repositories/directory";
import type { IUserBadgeRepository } from "../repositories/user-badge.repository.interface";
import type { IUserGamificationRepository } from "../repositories/user-gamification.repository.interface";
import type { IXpEventRepository, XpRankRow } from "../repositories/xp-event.repository.interface";
import { GamificationQueryService } from "../services/gamification-query.service";
import { LeaderboardService, type ILeaderboardCache } from "../services/leaderboard.service";
import { DEFAULT_LEVEL_CONFIG } from "../services/level";
import type { LevelConfigService } from "../services/level-config.service";

const NOW = new Date("2026-09-16T03:00:00Z");
const WS = "a1".repeat(12);
const VIEWER = "01".repeat(12);
const WITH_AVATAR = "02".repeat(12);
const ASSET = "65f0000000000000000000c7";
/** URL ảnh hiển thị TUYỆT ĐỐI ký sẵn (bản THUMB) — client dùng thẳng làm nguồn ảnh, không cần Bearer. */
const SIGNED_THUMB = new RegExp(`^https?://\\S+/api/v1/assets/${ASSET}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);

const gamUser = (id: string, over: Partial<GamUser> = {}): GamUser => ({
  id,
  name: `Người ${id.slice(0, 2)}`,
  status: "ACTIVE",
  timezone: "Asia/Ho_Chi_Minh",
  avatarAssetId: null,
  showInLeaderboard: true,
  showGamification: true,
  ...over,
});

/** Thư mục giả: `getUsers` trả đúng các id được hỏi (MỘT lượt cho cả bảng — ảnh đi cùng tên). */
function directoryOf(users: GamUser[]) {
  const getUsers = jest.fn((ids: readonly string[]) => Promise.resolve(new Map(users.filter((u) => ids.includes(u.id)).map((u) => [u.id, u]))));
  const directory = {
    getUsers,
    listMemberIds: () => Promise.resolve(users.map((u) => u.id)),
    getTimezoneAndStatus: () => Promise.resolve({ timezone: "Asia/Ho_Chi_Minh", status: "ACTIVE" }),
  } as unknown as IGamDirectory;
  return { directory, getUsers };
}

describe("LeaderboardService.top — avatarUrl cạnh avatarAssetId (GET /workspaces/:id/leaderboard)", () => {
  it("người có ảnh → avatarUrl ký sẵn (THUMB) của đúng asset, giữ avatarAssetId; chưa có ảnh → null; không truy vấn người thêm", async () => {
    const rows: XpRankRow[] = [
      { userId: WITH_AVATAR, xp: 120 },
      { userId: VIEWER, xp: 80 },
    ];
    const { directory, getUsers } = directoryOf([gamUser(WITH_AVATAR, { avatarAssetId: ASSET }), gamUser(VIEWER)]);
    const events = { rankByWorkspace: () => Promise.resolve(rows) } as unknown as IXpEventRepository;
    const users = { findMany: () => Promise.resolve([]) } as unknown as IUserGamificationRepository;
    const cache: ILeaderboardCache = { get: () => Promise.resolve(null), set: () => Promise.resolve() };

    const res = await new LeaderboardService({ events, directory, users, cache, now: () => NOW }).top(VIEWER, WS, "WEEK");

    expect(res.entries.map((e) => [e.rank, e.userId])).toEqual([
      [1, WITH_AVATAR],
      [2, VIEWER],
    ]);
    expect(res.entries[0].avatarAssetId).toBe(ASSET);
    expect(res.entries[0].avatarUrl).toMatch(SIGNED_THUMB);
    expect(res.entries[1]).toMatchObject({ avatarAssetId: null, avatarUrl: null });
    expect(getUsers).toHaveBeenCalledTimes(1);
  });
});

describe("GamificationQueryService.publicProfile — avatarUrl cạnh avatarAssetId (GET /users/:id/gamification/public)", () => {
  it("tự xem hồ sơ của mình khi có ảnh → avatarUrl ký sẵn (THUMB)", async () => {
    const { directory } = directoryOf([gamUser(VIEWER, { avatarAssetId: ASSET })]);
    const service = new GamificationQueryService({
      users: { find: () => Promise.resolve(null) } as unknown as IUserGamificationRepository,
      badges: { findByIds: () => Promise.resolve([]) } as unknown as IBadgeRepository,
      userBadges: { listByUser: () => Promise.resolve([]) } as unknown as IUserBadgeRepository,
      events: {} as IXpEventRepository,
      directory,
      levels: { get: () => Promise.resolve(DEFAULT_LEVEL_CONFIG) } as unknown as LevelConfigService,
      now: () => NOW,
    });
    const viewer: AuthUser = { id: VIEWER, email: "v@e.com", role: "user" };

    const profile = await service.publicProfile(viewer, VIEWER);
    expect(profile).toMatchObject({ userId: VIEWER, avatarAssetId: ASSET, level: 1 });
    expect(profile.avatarUrl).toMatch(SIGNED_THUMB);
  });
});
