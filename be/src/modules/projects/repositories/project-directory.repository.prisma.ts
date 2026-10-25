import { escapeRegex } from "../../../core/utils/escape-regex";
import { normalizeSearch } from "../../../core/utils/normalize";
import { avatarUrlOf } from "../../../shared/media";
import { db } from "./prisma-tx";
import type { IProjectDirectory, UserSummary } from "./project-directory.interface";

/** Trần số thành viên đọc để lọc tên — nhóm học tập nhỏ; nhóm lớn hơn vẫn ra kết quả đúng cho phần đầu danh sách. */
const MEMBER_SCAN_CAP = 2000;
const USER_SCAN_CAP = 200;

/** Mỗi từ khoá phải là TIỀN TỐ của một từ trong tên ("lan" khớp "Lan Anh" và "Thanh Lan", không khớp "Thlan"). */
function startsAWord(normalizedName: string, tokens: string[]): boolean {
  const words = normalizedName.split(" ").filter(Boolean);
  return tokens.every((t) => words.some((w) => w.startsWith(t)));
}

export class PrismaProjectDirectory implements IProjectDirectory {
  async activeMemberIds(workspaceId: string, userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await db().workspaceMembership.findMany({
      where: { workspaceId, userId: { in: userIds }, status: "ACTIVE", role: { not: "GUEST" } },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  async userSummaries(userIds: string[]): Promise<Map<string, UserSummary>> {
    if (userIds.length === 0) return new Map();
    // `avatarAssetId` đi CÙNG truy vấn tên (không N+1); `avatarUrlOf` là hàm thuần — ẩn danh hoá xoá `avatarAssetId` ⇒ `null`.
    const rows = await db().user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatarAssetId: true } });
    return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, avatarUrl: avatarUrlOf(r.avatarAssetId) }]));
  }

  async searchMentionables(workspaceId: string, q: string, limit: number): Promise<UserSummary[]> {
    const members = await db().workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE", role: { not: "GUEST" } },
      select: { userId: true },
      take: MEMBER_SCAN_CAP,
    });
    if (members.length === 0) return [];
    const tokens = normalizeSearch(q).split(" ").filter(Boolean);
    const users = await db().user.findMany({
      where: {
        id: { in: members.map((m) => m.userId) },
        status: "ACTIVE",
        // Chuỗi người dùng vào regex PHẢI qua `escapeRegex` (Prisma+Mongo dịch `contains` thành `$regex` không thoát).
        ...(tokens.length > 0 && { AND: tokens.map((t) => ({ normalizedName: { contains: escapeRegex(t) } })) }),
      },
      select: { id: true, name: true, normalizedName: true, avatarAssetId: true },
      take: USER_SCAN_CAP,
    });
    return users
      .filter((u) => startsAWord(u.normalizedName, tokens))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"))
      .slice(0, limit)
      .map((u) => ({ id: u.id, name: u.name, avatarUrl: avatarUrlOf(u.avatarAssetId) }));
  }

  async notificationExists(dedupeKey: string): Promise<boolean> {
    const found = await db().notification.findUnique({ where: { dedupeKey }, select: { id: true } });
    return found !== null;
  }

  async listReviewerCandidateIds(workspaceId: string, limit: number): Promise<string[]> {
    const members = await db().workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE", role: { not: "GUEST" } },
      select: { userId: true },
      orderBy: { userId: "asc" },
      take: limit,
    });
    if (members.length === 0) return [];
    // Tài khoản đã khoá/ẩn danh hoá vẫn có thể còn membership ACTIVE — không giao chấm cho họ.
    const users = await db().user.findMany({ where: { id: { in: members.map((m) => m.userId) }, status: "ACTIVE" }, select: { id: true } });
    const active = new Set(users.map((u) => u.id));
    return members.map((m) => m.userId).filter((id) => active.has(id));
  }

  async activeReviewerIds(workspaceId: string, userIds: string[]): Promise<Set<string>> {
    const members = await this.activeMemberIds(workspaceId, userIds);
    if (members.size === 0) return members;
    const users = await db().user.findMany({ where: { id: { in: [...members] }, status: "ACTIVE" }, select: { id: true } });
    return new Set(users.map((u) => u.id));
  }

  async listAdminIds(workspaceId: string): Promise<string[]> {
    const rows = await db().workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async boardNames(boardIds: string[]): Promise<Map<string, string>> {
    if (boardIds.length === 0) return new Map();
    const rows = await db().board.findMany({ where: { id: { in: boardIds } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async workspaceNames(workspaceIds: string[]): Promise<Map<string, string>> {
    if (workspaceIds.length === 0) return new Map();
    const rows = await db().workspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async workspaceIdsWhereMember(userId: string, workspaceIds: string[]): Promise<Set<string>> {
    if (workspaceIds.length === 0) return new Set();
    const rows = await db().workspaceMembership.findMany({
      where: { userId, workspaceId: { in: workspaceIds }, status: "ACTIVE", role: { not: "GUEST" } },
      select: { workspaceId: true },
    });
    return new Set(rows.map((r) => r.workspaceId));
  }

  async workspaceTimezone(workspaceId: string): Promise<string | null> {
    const row = await db().workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
    return row?.timezone ?? null;
  }
}
