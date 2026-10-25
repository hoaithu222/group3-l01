import { prisma } from "../../infrastructure/database";
import { NotFoundError } from "../../core/exceptions";
import type { GroupConversationService } from "../conversations/public";
import type { AdminListConversationsQueryDto } from "./admin-conversations.validators";

export interface AdminConversationRow {
  id: string;
  kind: "GROUP";
  memberCount: number;
  ownerName: string | null;
  status: string;
  createdAt: Date;
  lastActivityAt: Date;
  isMeetingGroup: boolean;
}

export interface AdminConversationStats {
  groups: number;
  activeGroups7d: number;
  dmPairs: number;
  messages7d: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

/**
 * be.md §4/README §2 — CHỈ số liệu (KHÔNG title/tên thành viên khác ngoài
 * `ownerName`, field be.md liệt kê tường minh là được phép). `dmPairs` là
 * xấp xỉ: DIRECT không gắn 1 workspace cụ thể theo thiết kế (be.md p1-05 §2
 * quyết định "Phạm vi DM: Không gắn workspace") nên không có FK trực tiếp để
 * đếm — tính bằng số hội thoại DIRECT mà CẢ HAI phía đều đang là thành viên
 * ACTIVE của workspace này.
 */
export class AdminConversationsService {
  constructor(private readonly groupService: GroupConversationService) {}

  async list(workspaceId: string, query: AdminListConversationsQueryDto): Promise<{ data: AdminConversationRow[]; total: number; stats: AdminConversationStats }> {
    const where = { workspaceId, kind: "GROUP" as const, ...(query.status && { status: query.status }) };

    const [rows, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { activityAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.conversation.count({ where }),
    ]);

    const ownerIds = Array.from(new Set(rows.map((r) => r.ownerId).filter((id): id is string => id !== null)));
    const owners = ownerIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : [];
    const ownerNameById = new Map(owners.map((o) => [o.id, o.name]));

    const data: AdminConversationRow[] = rows.map((r) => ({
      id: r.id,
      kind: "GROUP",
      memberCount: r.memberCount,
      ownerName: r.ownerId ? ownerNameById.get(r.ownerId) ?? null : null,
      status: r.status,
      createdAt: r.createdAt,
      lastActivityAt: r.activityAt,
      isMeetingGroup: r.meetingId !== null,
    }));

    const stats = await this.computeStats(workspaceId);
    return { data, total, stats };
  }

  async dissolve(adminId: string, conversationId: string): Promise<{ id: string; status: string }> {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.kind !== "GROUP") throw new NotFoundError();
    return this.groupService.platformDissolve(adminId, conversationId);
  }

  private async computeStats(workspaceId: string): Promise<AdminConversationStats> {
    const since7d = new Date(Date.now() - SEVEN_DAYS_MS);

    const [groups, activeGroups7d, groupIds, workspaceUserRows] = await Promise.all([
      prisma.conversation.count({ where: { workspaceId, kind: "GROUP" } }),
      prisma.conversation.count({ where: { workspaceId, kind: "GROUP", activityAt: { gte: since7d } } }),
      prisma.conversation.findMany({ where: { workspaceId, kind: "GROUP" }, select: { id: true } }),
      prisma.workspaceMembership.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { userId: true } }),
    ]);

    const workspaceUserIds = new Set(workspaceUserRows.map((r) => r.userId));
    const directMembers =
      workspaceUserIds.size > 0
        ? await prisma.conversationMember.findMany({
            where: { kind: "DIRECT", status: "ACTIVE", userId: { in: Array.from(workspaceUserIds) } },
            select: { conversationId: true, peerUserId: true },
          })
        : [];
    const dmPairs = new Set(directMembers.filter((m) => m.peerUserId && workspaceUserIds.has(m.peerUserId)).map((m) => m.conversationId)).size;

    const messages7d =
      groupIds.length > 0
        ? await prisma.message.count({
            where: { scopeType: "CONVERSATION", scopeId: { in: groupIds.map((g) => g.id) }, createdAt: { gte: since7d } },
          })
        : 0;

    return { groups, activeGroups7d, dmPairs, messages7d };
  }
}
