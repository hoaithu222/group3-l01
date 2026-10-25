import type { MentorEngagement as PrismaMentorEngagement } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { MentorEngagement, MentorEngagementCreateInput, MentorEngagementStatus } from "../entities/mentor.interface";
import type { EngagementEnd, IMentorEngagementRepository } from "./mentor-engagement.repository.interface";
import type { TxHandle } from "./tx";

const toEntity = (r: PrismaMentorEngagement): MentorEngagement => ({
  id: r.id,
  postId: r.postId,
  applicationId: r.applicationId,
  workspaceId: r.workspaceId,
  mentorId: r.mentorId,
  acceptedBy: r.acceptedBy,
  channelIds: r.channelIds,
  conversationId: r.conversationId ?? null,
  startedAt: r.startedAt,
  endsAt: r.endsAt,
  totalDays: r.totalDays,
  status: r.status,
  endedAt: r.endedAt ?? null,
  endedReason: r.endedReason ?? null,
  endedBy: r.endedBy ?? null,
  endingSoonNotifiedAt: r.endingSoonNotifiedAt ?? null,
  version: r.version,
  createdAt: r.createdAt,
});

export class PrismaMentorEngagementRepository implements IMentorEngagementRepository {
  async findById(id: string, tx?: TxHandle): Promise<MentorEngagement | null> {
    const row = await (tx ?? prisma).mentorEngagement.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async create(tx: TxHandle, input: MentorEngagementCreateInput): Promise<MentorEngagement> {
    // Ghi `null` TƯỜNG MINH cho field về sau lọc bằng `{ f: null }` (bẫy Prisma-Mongo absent ≠ null).
    const row = await tx.mentorEngagement.create({
      data: { ...input, status: "ACTIVE", conversationId: null, endedAt: null, endedReason: null, endedBy: null, endingSoonNotifiedAt: null },
    });
    return toEntity(row);
  }

  async findActiveByWorkspaceAndMentor(workspaceId: string, mentorId: string): Promise<MentorEngagement | null> {
    const row = await prisma.mentorEngagement.findFirst({ where: { workspaceId, mentorId, status: "ACTIVE" } });
    return row ? toEntity(row) : null;
  }

  async listByWorkspace(workspaceId: string, status: MentorEngagementStatus | undefined, limit: number): Promise<MentorEngagement[]> {
    const rows = await prisma.mentorEngagement.findMany({
      where: { workspaceId, ...(status && { status }) },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map(toEntity);
  }

  async listByMentor(mentorId: string, status: MentorEngagementStatus | undefined, limit: number): Promise<MentorEngagement[]> {
    const rows = await prisma.mentorEngagement.findMany({
      where: { mentorId, ...(status && { status }) },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map(toEntity);
  }

  async findByApplicationIds(applicationIds: string[]): Promise<MentorEngagement[]> {
    if (applicationIds.length === 0) return [];
    return (await prisma.mentorEngagement.findMany({ where: { applicationId: { in: applicationIds } } })).map(toEntity);
  }

  async end(tx: TxHandle, id: string, expectedVersion: number | null, end: EngagementEnd): Promise<boolean> {
    const res = await tx.mentorEngagement.updateMany({
      where: { id, status: "ACTIVE", ...(expectedVersion !== null && { version: expectedVersion }) },
      data: { status: "ENDED", endedAt: end.at, endedReason: end.reason, endedBy: end.by, version: { increment: 1 } },
    });
    return res.count === 1;
  }

  async extend(tx: TxHandle, id: string, expectedVersion: number, next: { endsAt: Date; totalDays: number }): Promise<boolean> {
    const res = await tx.mentorEngagement.updateMany({
      where: { id, status: "ACTIVE", version: expectedVersion },
      data: { endsAt: next.endsAt, totalDays: next.totalDays, endingSoonNotifiedAt: null, version: { increment: 1 } },
    });
    return res.count === 1;
  }

  async setConversation(id: string, conversationId: string): Promise<boolean> {
    const res = await prisma.mentorEngagement.updateMany({
      where: { id, OR: [{ conversationId: null }, { conversationId: { isSet: false } }] },
      data: { conversationId },
    });
    return res.count === 1;
  }

  async listDueToExpire(now: Date, limit: number): Promise<MentorEngagement[]> {
    const rows = await prisma.mentorEngagement.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } }, orderBy: { endsAt: "asc" }, take: limit });
    return rows.map(toEntity);
  }

  async listEndingSoon(now: Date, until: Date, limit: number): Promise<MentorEngagement[]> {
    const rows = await prisma.mentorEngagement.findMany({
      where: { status: "ACTIVE", endsAt: { gt: now, lte: until }, OR: [{ endingSoonNotifiedAt: null }, { endingSoonNotifiedAt: { isSet: false } }] },
      orderBy: { endsAt: "asc" },
      take: limit,
    });
    return rows.map(toEntity);
  }

  async markEndingSoonNotified(tx: TxHandle, id: string, at: Date): Promise<boolean> {
    const res = await tx.mentorEngagement.updateMany({
      where: { id, status: "ACTIVE", OR: [{ endingSoonNotifiedAt: null }, { endingSoonNotifiedAt: { isSet: false } }] },
      data: { endingSoonNotifiedAt: at },
    });
    return res.count === 1;
  }
}
