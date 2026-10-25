import { LIMITS } from "../../../core/constants/limits";
import { redis } from "../../../infrastructure/redis";
import type { IGamDirectory } from "../repositories/directory";
import type { IUserGamificationRepository } from "../repositories/user-gamification.repository.interface";
import type { IXpEventRepository, XpRankRow } from "../repositories/xp-event.repository.interface";
import { avatarUrlOf } from "../../../shared/media";
import { periodRange, type LeaderboardPeriod } from "./leaderboard-period";

/** Bộ nhớ đệm bảng xếp hạng THÔ (chưa lọc riêng tư) — chỉ `{ userId, xp }`, KHÔNG chứa tên/riêng tư nên đổi công tắc ẩn có hiệu lực NGAY (lọc lúc đọc). */
export interface ILeaderboardCache {
  get(key: string): Promise<XpRankRow[] | null>;
  set(key: string, rows: XpRankRow[], ttlSeconds: number): Promise<void>;
}

export class RedisLeaderboardCache implements ILeaderboardCache {
  async get(key: string): Promise<XpRankRow[] | null> {
    try {
      return await redis.get<XpRankRow[]>(key);
    } catch {
      return null;
    }
  }

  async set(key: string, rows: XpRankRow[], ttlSeconds: number): Promise<void> {
    try {
      await redis.set(key, rows, ttlSeconds);
    } catch {
      // Best-effort — lần sau tính lại.
    }
  }
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  /** Asset id thô — giữ nguyên hợp đồng cũ; để hiển thị dùng `avatarUrl`. */
  avatarAssetId: string | null;
  /** URL ảnh hiển thị TUYỆT ĐỐI ký sẵn (THUMB) dựng từ `avatarAssetId` — dùng thẳng làm nguồn ảnh; chưa có ảnh → `null`. */
  avatarUrl: string | null;
  level: number;
  xp: number;
}

export interface LeaderboardResult {
  period: LeaderboardPeriod;
  from: string | null;
  to: string | null;
  entries: LeaderboardEntry[];
  /** `rank` = hạng của tôi trong danh sách HIỂN THỊ (kể cả khi tôi đang ẩn — khi ấy `hidden: true`, "Bạn đang ẩn"); `null` khi tôi chưa có XP trong kỳ. */
  me: { rank: number | null; xp: number; hidden: boolean };
  serverNow: string;
}

/** Số ứng viên đọc vượt `top` để bù người bị lọc (opt-out, không còn là thành viên). */
const CANDIDATE_FACTOR = 3;
/** Trần số người đưa vào bảng thô (workspace rất lớn cần Redis ZSET — P1 README §10). */
const RAW_LIMIT = 1000;

/**
 * Bảng xếp hạng nhóm theo kỳ (p4-03 be.md §5.4): tổng `XpEvent.xp > 0` theo `workspaceId` trong kỳ (tuần thứ Hai / tháng / tất cả), bộ nhớ đệm THÔ
 * `LIMITS.leaderboard.cacheSeconds`; mỗi lần đọc LỌC bằng dữ liệu tươi: chỉ thành viên ACTIVE không phải khách, người dùng ACTIVE, bỏ người tắt
 * `privacy.showInLeaderboard` (GM-10 — có hiệu lực ngay, không cần xoá đệm). Quyền xem (MEMBER+, khách → 404) do middleware route kiểm.
 */
export class LeaderboardService {
  constructor(
    private readonly d: { events: IXpEventRepository; directory: IGamDirectory; users: IUserGamificationRepository; cache: ILeaderboardCache; now?: () => Date }
  ) {}

  async top(viewerId: string, workspaceId: string, period: LeaderboardPeriod): Promise<LeaderboardResult> {
    const now = this.d.now?.() ?? new Date();
    const range = periodRange(period, now);
    const key = `lb:${workspaceId}:${period}:${range.key}`;
    let raw = await this.d.cache.get(key);
    if (!raw) {
      raw = await this.d.events.rankByWorkspace(workspaceId, range.from, range.to, RAW_LIMIT);
      await this.d.cache.set(key, raw, LIMITS.leaderboard.cacheSeconds);
    }

    const members = new Set(await this.d.directory.listMemberIds(workspaceId));
    const inMembers = raw.filter((r) => members.has(r.userId));
    const window = inMembers.slice(0, LIMITS.leaderboard.top * CANDIDATE_FACTOR + 1);
    const people = await this.d.directory.getUsers([...window.map((r) => r.userId), viewerId]);
    const visible = window.filter((r) => {
      const u = people.get(r.userId);
      return !!u && u.status === "ACTIVE" && u.showInLeaderboard;
    });

    const shown = visible.slice(0, LIMITS.leaderboard.top);
    const levels = new Map((await this.d.users.findMany(shown.map((r) => r.userId))).map((g) => [g.userId, g.level]));
    const entries = shown.map((r, i): LeaderboardEntry => {
      const person = people.get(r.userId);
      const avatarAssetId = person?.avatarAssetId ?? null;
      return { rank: i + 1, userId: r.userId, name: person?.name ?? "", avatarAssetId, avatarUrl: avatarUrlOf(avatarAssetId), level: levels.get(r.userId) ?? 1, xp: r.xp };
    });

    const myXp = inMembers.find((r) => r.userId === viewerId)?.xp ?? 0;
    const hidden = people.get(viewerId)?.showInLeaderboard === false;
    const myRank = myXp > 0 ? visible.filter((r) => r.xp > myXp && r.userId !== viewerId).length + 1 : null;
    return { period, from: range.from?.toISOString() ?? null, to: range.to?.toISOString() ?? null, entries, me: { rank: myRank, xp: myXp, hidden }, serverNow: now.toISOString() };
  }
}
