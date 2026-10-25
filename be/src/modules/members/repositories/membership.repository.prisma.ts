import { prisma } from "../../../infrastructure/database";
import { normalizeSearch } from "../../../core/utils/normalize";
import { decodeCursor } from "../../../core/utils/cursor";
import { rankOf } from "../services/member-rank.policy";
import type {
  IMembershipRepository,
  MembershipWithUser,
  MemberUserSummary,
} from "./membership.repository.interface";
import type { WorkspaceMembership, ListMembersParams, AdminListMembersParams } from "../entities/member.interface";

type MembershipRecord = Awaited<ReturnType<typeof prisma.workspaceMembership.findFirstOrThrow>>;

function mapMembership(record: MembershipRecord): WorkspaceMembership {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    userId: record.userId,
    role: record.role,
    status: record.status,
    displayName: record.displayName,
    joinedAt: record.joinedAt,
    leftAt: record.leftAt,
    expiresAt: record.expiresAt,
    invitedBy: record.invitedBy,
    inviteLinkId: record.inviteLinkId,
    banReason: record.banReason,
    removedBy: record.removedBy,
    expiryVersion: record.expiryVersion,
    leftReason: record.leftReason,
    requestMessage: record.requestMessage,
    requestedAt: record.requestedAt,
    decidedBy: record.decidedBy,
    decidedAt: record.decidedAt,
    invitationId: record.invitationId,
    displayTag: record.displayTag ?? null,
  };
}

function sortRows(rows: MembershipWithUser[], sort: "role" | "name" | "joinedAt"): MembershipWithUser[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sort === "role") {
      const diff = rankOf(b.membership.role) - rankOf(a.membership.role);
      if (diff !== 0) return diff;
      return a.user.normalizedName.localeCompare(b.user.normalizedName);
    }
    if (sort === "name") return a.user.normalizedName.localeCompare(b.user.normalizedName);
    return a.membership.joinedAt.getTime() - b.membership.joinedAt.getTime();
  });
  return sorted;
}

export class PrismaMembershipRepository implements IMembershipRepository {
  async findByWorkspaceAndUser(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
    const record = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    return record ? mapMembership(record) : null;
  }

  async findWithUser(workspaceId: string, userId: string): Promise<MembershipWithUser | null> {
    const record = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!record) return null;
    const [joined] = await this.joinUsers([mapMembership(record)]);
    return joined ?? null;
  }

  async countActiveByUser(userId: string): Promise<number> {
    return prisma.workspaceMembership.count({ where: { userId, status: "ACTIVE" } });
  }

  async listPendingRequests(
    workspaceId: string,
    params: { cursor?: string; limit: number }
  ): Promise<{ data: MembershipWithUser[]; hasMore: boolean }> {
    const decoded = params.cursor ? decodeCursor(params.cursor) : null;
    const records = await prisma.workspaceMembership.findMany({
      where: {
        workspaceId,
        status: "PENDING",
        ...(decoded && {
          OR: [{ requestedAt: { lt: decoded.at } }, { requestedAt: decoded.at, id: { lt: decoded.id } }],
        }),
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });
    const hasMore = records.length > params.limit;
    const page = hasMore ? records.slice(0, params.limit) : records;
    return { data: await this.joinUsers(page.map(mapMembership)), hasMore };
  }

  async listExpiredGuests(now: Date, limit: number): Promise<WorkspaceMembership[]> {
    const records = await prisma.workspaceMembership.findMany({
      where: { role: "GUEST", status: "ACTIVE", expiresAt: { lte: now } },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });
    return records.map(mapMembership);
  }

  async listGuestChannelIds(workspaceId: string, userId: string): Promise<string[]> {
    const grants = await prisma.channelGrant.findMany({
      where: { workspaceId, userId, source: "DIRECT" },
      select: { channelId: true },
    });
    return grants.map((g) => g.channelId);
  }

  async listMembers(
    workspaceId: string,
    params: ListMembersParams
  ): Promise<{ data: MembershipWithUser[]; total: number }> {
    const records = await prisma.workspaceMembership.findMany({
      where: {
        workspaceId,
        status: params.status,
        ...(params.role && { role: params.role }),
      },
    });
    const joined = await this.joinUsers(records.map(mapMembership));
    const filtered = params.q ? this.filterByQuery(joined, params.q) : joined;
    const sorted = sortRows(filtered, params.sort);
    return this.paginate(sorted, params.page, params.limit);
  }

  async adminListMembers(
    workspaceId: string,
    params: AdminListMembersParams
  ): Promise<{ data: MembershipWithUser[]; total: number }> {
    const records = await prisma.workspaceMembership.findMany({
      where: {
        workspaceId,
        ...(params.status && { status: params.status }),
        ...(params.role && { role: params.role }),
      },
    });
    const joined = await this.joinUsers(records.map(mapMembership));
    const filtered = params.q ? this.filterByQuery(joined, params.q) : joined;
    const sorted = sortRows(filtered, params.sort);
    return this.paginate(sorted, params.page, params.limit);
  }

  private async joinUsers(memberships: WorkspaceMembership[]): Promise<MembershipWithUser[]> {
    if (memberships.length === 0) return [];
    const userIds = Array.from(new Set(memberships.map((m) => m.userId)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, normalizedName: true, email: true, avatarAssetId: true },
    });
    const byId = new Map<string, MemberUserSummary>(users.map((u) => [u.id, u]));
    const result: MembershipWithUser[] = [];
    for (const membership of memberships) {
      const user = byId.get(membership.userId);
      if (!user) continue; // tài khoản đã bị xoá hẳn (hiếm, không hiện trong danh sách)
      result.push({ membership, user });
    }
    return result;
  }

  private filterByQuery(rows: MembershipWithUser[], q: string): MembershipWithUser[] {
    const needle = normalizeSearch(q);
    return rows.filter((row) => row.user.normalizedName.includes(needle));
  }

  private paginate(
    rows: MembershipWithUser[],
    page: number,
    limit: number
  ): { data: MembershipWithUser[]; total: number } {
    const start = (page - 1) * limit;
    return { data: rows.slice(start, start + limit), total: rows.length };
  }
}
