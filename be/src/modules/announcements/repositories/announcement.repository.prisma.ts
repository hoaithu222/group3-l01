import { Prisma } from "@prisma/client";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import type { OutboxEventInput } from "../../../infrastructure/queue/outbox/outbox.types";
import type { CursorPoint } from "../../../core/utils/search-query";
import { isGrantRoleRef, workspaceRolesCoveredByAny } from "../../../core/constants/role-coverage";
import type {
  AnnouncementChannel,
  AnnouncementMessage,
  AnnouncementReceipt,
  AnnouncementRequest,
} from "../entities/announcement.interface";
import type {
  AnnouncementUserBrief,
  ConfirmResult,
  CreateRequestInput,
  IAnnouncementLookupRepository,
  IAnnouncementRepository,
} from "./announcement.repository.interface";

type RequestRow = Awaited<ReturnType<typeof prisma.announcementRequest.findFirstOrThrow>>;

const mapRequest = (r: RequestRow): AnnouncementRequest => ({
  id: r.id,
  messageId: r.messageId,
  channelId: r.channelId,
  workspaceId: r.workspaceId,
  requestedBy: r.requestedBy,
  deadlineAt: r.deadlineAt,
  confirmedCount: r.confirmedCount,
  cancelledAt: r.cancelledAt,
  cancelledBy: r.cancelledBy,
  createdAt: r.createdAt,
});

const isUniqueViolation = (err: unknown): boolean => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export class PrismaAnnouncementRepository implements IAnnouncementRepository {
  async findByMessageId(messageId: string): Promise<AnnouncementRequest | null> {
    const row = await prisma.announcementRequest.findUnique({ where: { messageId } });
    return row ? mapRequest(row) : null;
  }

  async findById(id: string): Promise<AnnouncementRequest | null> {
    const row = await prisma.announcementRequest.findUnique({ where: { id } });
    return row ? mapRequest(row) : null;
  }

  async listByChannel(channelId: string, limit: number): Promise<AnnouncementRequest[]> {
    const rows = await prisma.announcementRequest.findMany({
      where: { channelId, cancelledAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map(mapRequest);
  }

  async countActive(channelId: string, now: Date): Promise<number> {
    return prisma.announcementRequest.count({
      where: { channelId, cancelledAt: null, OR: [{ deadlineAt: null }, { deadlineAt: { gt: now } }] },
    });
  }

  async create(input: CreateRequestInput, events: OutboxEventInput[]): Promise<{ request: AnnouncementRequest; created: boolean }> {
    try {
      const row = await withTransaction(async (tx) => {
        const created = await tx.announcementRequest.create({
          data: {
            messageId: input.messageId,
            channelId: input.channelId,
            workspaceId: input.workspaceId,
            requestedBy: input.requestedBy,
            // Ghi null TƯỜNG MINH — bộ lọc `{ cancelledAt: null }`/`{ deadlineAt: null }` không khớp field vắng mặt (Prisma+Mongo).
            deadlineAt: input.deadlineAt ?? null,
            cancelledAt: null,
            cancelledBy: null,
            confirmedCount: 0,
          },
        });
        for (const event of events) await outbox.add(tx, event);
        return created;
      });
      return { request: mapRequest(row), created: true };
    } catch (err) {
      // Yêu cầu song song trùng `messageId`: transaction đã abort — đọc bản thắng cuộc NGOÀI transaction, không tiếp tục trong tx.
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.findByMessageId(input.messageId);
      if (!existing) throw err;
      return { request: existing, created: false };
    }
  }

  async reactivate(id: string, deadlineAt: Date | null, events: OutboxEventInput[]): Promise<AnnouncementRequest> {
    const row = await withTransaction(async (tx) => {
      const updated = await tx.announcementRequest.update({ where: { id }, data: { cancelledAt: null, cancelledBy: null, deadlineAt: deadlineAt ?? null } });
      for (const event of events) await outbox.add(tx, event);
      return updated;
    });
    return mapRequest(row);
  }

  async cancel(id: string, cancelledBy: string, at: Date): Promise<AnnouncementRequest | null> {
    const result = await prisma.announcementRequest.updateMany({ where: { id, cancelledAt: null }, data: { cancelledAt: at, cancelledBy } });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async findReceipt(requestId: string, userId: string): Promise<AnnouncementReceipt | null> {
    const row = await prisma.announcementReceipt.findUnique({ where: { requestId_userId: { requestId, userId } } });
    return row ? { ...row } : null;
  }

  async confirm(requestId: string, userId: string, at: Date): Promise<ConfirmResult> {
    const existing = await this.findReceipt(requestId, userId);
    if (existing) return { created: false, receipt: existing, confirmedCount: await this.confirmedCountOf(requestId) };
    try {
      const receipt = await withTransaction(async (tx) => {
        const created = await tx.announcementReceipt.create({ data: { requestId, userId, confirmedAt: at } });
        await tx.announcementRequest.update({ where: { id: requestId }, data: { confirmedCount: { increment: 1 } } });
        return created;
      });
      return { created: true, receipt: { ...receipt }, confirmedCount: await this.confirmedCountOf(requestId) };
    } catch (err) {
      // Bấm song song: transaction thua đã abort (P2002) — đọc biên nhận thắng cuộc NGOÀI transaction (RC-01: một receipt).
      if (!isUniqueViolation(err)) throw err;
      const winner = await this.findReceipt(requestId, userId);
      if (!winner) throw err;
      return { created: false, receipt: winner, confirmedCount: await this.confirmedCountOf(requestId) };
    }
  }

  async confirmedRequestIds(userId: string, requestIds: readonly string[]): Promise<Set<string>> {
    if (requestIds.length === 0) return new Set();
    const rows = await prisma.announcementReceipt.findMany({ where: { userId, requestId: { in: [...requestIds] } }, select: { requestId: true } });
    return new Set(rows.map((r) => r.requestId));
  }

  async listReceipts(requestId: string, limit: number, before?: CursorPoint): Promise<AnnouncementReceipt[]> {
    const rows = await prisma.announcementReceipt.findMany({
      where: {
        requestId,
        ...(before
          ? { OR: [{ confirmedAt: { lt: before.at } }, { confirmedAt: before.at, id: { lt: before.id } }] }
          : {}),
      },
      orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map((r) => ({ ...r }));
  }

  async confirmedUserIds(requestId: string, userIds: readonly string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await prisma.announcementReceipt.findMany({ where: { requestId, userId: { in: [...userIds] } }, select: { userId: true } });
    return new Set(rows.map((r) => r.userId));
  }

  private async confirmedCountOf(requestId: string): Promise<number> {
    const row = await prisma.announcementRequest.findUnique({ where: { id: requestId }, select: { confirmedCount: true } });
    return row?.confirmedCount ?? 0;
  }
}

export class PrismaAnnouncementLookupRepository implements IAnnouncementLookupRepository {
  async findMessage(messageId: string): Promise<AnnouncementMessage | null> {
    const m = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, scopeType: true, scopeId: true, workspaceId: true, threadId: true, kind: true, authorId: true, deletedAt: true },
    });
    return m ? { ...m } : null;
  }

  async findChannel(channelId: string): Promise<AnnouncementChannel | null> {
    const c = await prisma.channel.findUnique({ where: { id: channelId }, select: { id: true, workspaceId: true, postingPolicy: true, status: true } });
    return c ? { ...c } : null;
  }

  async userBriefs(userIds: readonly string[]): Promise<Map<string, AnnouncementUserBrief>> {
    const unique = Array.from(new Set(userIds));
    if (unique.length === 0) return new Map();
    const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, avatarAssetId: true } });
    return new Map(users.map((u) => [u.id, { name: u.name, avatarAssetId: u.avatarAssetId ?? null }]));
  }

  async channelReaderIds(channelId: string): Promise<string[]> {
    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { workspaceId: true, visibility: true } });
    if (!channel) return [];
    const { workspaceId } = channel;
    const now = Date.now();
    const usable = (m: { role: string; expiresAt: Date | null }): boolean => !(m.role === "GUEST" && m.expiresAt && m.expiresAt.getTime() <= now);
    const memberSelect = { userId: true, role: true, expiresAt: true } as const;

    const grants = await prisma.channelGrant.findMany({ where: { channelId }, select: { userId: true, source: true, roleRef: true } });
    const directIds = grants.flatMap((g) => (g.source === "DIRECT" && g.userId ? [g.userId] : []));
    const roleRefs = grants.flatMap((g) => (g.source === "ROLE" && isGrantRoleRef(g.roleRef) ? [g.roleRef] : []));

    if (channel.visibility === "PUBLIC") {
      const [members, designated] = await Promise.all([
        prisma.workspaceMembership.findMany({ where: { workspaceId, status: "ACTIVE", role: { not: "GUEST" } }, select: memberSelect }),
        // Khách được chỉ định (grant DIRECT) đọc được kênh công khai đó.
        directIds.length > 0
          ? prisma.workspaceMembership.findMany({ where: { workspaceId, status: "ACTIVE", role: "GUEST", userId: { in: directIds } }, select: memberSelect })
          : Promise.resolve([]),
      ]);
      return Array.from(new Set([...members, ...designated].filter(usable).map((m) => m.userId)));
    }

    const [direct, viaRole] = await Promise.all([
      directIds.length > 0 ? prisma.workspaceMembership.findMany({ where: { workspaceId, status: "ACTIVE", userId: { in: directIds } }, select: memberSelect }) : Promise.resolve([]),
      roleRefs.length > 0
        ? prisma.workspaceMembership.findMany({ where: { workspaceId, status: "ACTIVE", role: { in: workspaceRolesCoveredByAny(roleRefs) } }, select: memberSelect })
        : Promise.resolve([]),
    ]);
    return Array.from(new Set([...direct, ...viaRole].filter(usable).map((m) => m.userId)));
  }
}
