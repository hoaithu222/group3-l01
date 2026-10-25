import { Prisma, type Meeting, type MeetingAttendee } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type {
  AttendeeEntity,
  AttendeePatch,
  MeetingEntity,
  MeetingPatch,
  MeetingStatusValue,
  NewAttendee,
  NewMeeting,
} from "../entities/meeting.interface";
import { AttendeeConflictError, MeetingCodeConflictError, type IMeetingRepository, type RangeFilter } from "./meeting.repository.interface";
import type { TxHandle } from "./tx";

const toMeeting = (row: Meeting): MeetingEntity => row as unknown as MeetingEntity;
const toAttendee = (row: MeetingAttendee): AttendeeEntity => row as unknown as AttendeeEntity;

const OPEN = ["SCHEDULED", "LIVE"] as const;

function statusFilter(statuses?: RangeFilter["statuses"]): { in: RangeFilter["statuses"] } | undefined {
  return statuses && statuses.length > 0 ? { in: statuses } : undefined;
}

/**
 * Prisma+Mongo: lọc `{ field: null }` KHÔNG khớp tài liệu vắng trường → mọi `create*` ở đây ghi null TƯỜNG MINH cho
 * `deletedAt`/`removedAt`/`conversationId`… (xem memory "Prisma-Mongo null vs absent").
 */
export class PrismaMeetingRepository implements IMeetingRepository {
  private db(tx?: TxHandle): TxHandle | typeof prisma {
    return tx ?? prisma;
  }

  async findById(id: string, opts: { tx?: TxHandle; includeDeleted?: boolean } = {}): Promise<MeetingEntity | null> {
    const row = await this.db(opts.tx).meeting.findUnique({ where: { id } });
    if (!row || (row.deletedAt && !opts.includeDeleted)) return null;
    return toMeeting(row);
  }

  async findByCode(code: string): Promise<MeetingEntity | null> {
    const row = await prisma.meeting.findUnique({ where: { code } });
    return row && !row.deletedAt ? toMeeting(row) : null;
  }

  async codeExists(code: string): Promise<boolean> {
    return (await prisma.meeting.count({ where: { code } })) > 0;
  }

  async findAttendee(meetingId: string, userId: string, tx?: TxHandle): Promise<AttendeeEntity | null> {
    const row = await this.db(tx).meetingAttendee.findUnique({ where: { meetingId_userId: { meetingId, userId } } });
    return row ? toAttendee(row) : null;
  }

  async findActiveAttendees(meetingId: string, tx?: TxHandle): Promise<AttendeeEntity[]> {
    const rows = await this.db(tx).meetingAttendee.findMany({ where: { meetingId, removedAt: null }, orderBy: [{ invitedAt: "asc" }, { id: "asc" }] });
    return rows.map(toAttendee);
  }

  async listAttendeesPage(meetingId: string, page: { cursor?: { at: Date; id: string }; limit: number }): Promise<AttendeeEntity[]> {
    const and: Prisma.MeetingAttendeeWhereInput[] = [{ meetingId }, { removedAt: null }];
    if (page.cursor) and.push({ OR: [{ invitedAt: { gt: page.cursor.at } }, { invitedAt: page.cursor.at, id: { gt: page.cursor.id } }] });
    const rows = await prisma.meetingAttendee.findMany({ where: { AND: and }, orderBy: [{ invitedAt: "asc" }, { id: "asc" }], take: page.limit + 1 });
    return rows.map(toAttendee);
  }

  async listMine(userId: string, f: RangeFilter & { workspaceId?: string }): Promise<Array<{ meeting: MeetingEntity; attendee: AttendeeEntity }>> {
    const rows = await prisma.meetingAttendee.findMany({
      where: {
        userId,
        removedAt: null,
        meetingStartAt: { lt: f.to },
        meetingEndAt: { gt: f.from },
        ...(f.workspaceId ? { workspaceId: f.workspaceId } : {}),
        ...(statusFilter(f.statuses) ? { meetingStatus: statusFilter(f.statuses) } : {}),
      },
      orderBy: { meetingStartAt: "asc" },
      take: f.limit,
    });
    if (rows.length === 0) return [];
    const meetings = await prisma.meeting.findMany({ where: { id: { in: rows.map((r) => r.meetingId) }, deletedAt: null } });
    const byId = new Map(meetings.map((m) => [m.id, toMeeting(m)]));
    return rows.flatMap((a) => {
      const meeting = byId.get(a.meetingId);
      return meeting ? [{ meeting, attendee: toAttendee(a) }] : [];
    });
  }

  async listWorkspaceVisible(workspaceIds: string[], f: RangeFilter): Promise<MeetingEntity[]> {
    if (workspaceIds.length === 0) return [];
    const rows = await prisma.meeting.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        visibility: "WORKSPACE",
        deletedAt: null,
        startAt: { lt: f.to },
        endAt: { gt: f.from },
        ...(statusFilter(f.statuses) ? { status: statusFilter(f.statuses) } : {}),
      },
      orderBy: { startAt: "asc" },
      take: f.limit,
    });
    return rows.map(toMeeting);
  }

  async listByWorkspace(workspaceId: string, f: RangeFilter): Promise<MeetingEntity[]> {
    const rows = await prisma.meeting.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        startAt: { lt: f.to },
        endAt: { gt: f.from },
        ...(statusFilter(f.statuses) ? { status: statusFilter(f.statuses) } : {}),
      },
      orderBy: { startAt: "asc" },
      take: f.limit,
    });
    return rows.map(toMeeting);
  }

  async findAttendeeRows(meetingIds: string[], userId: string): Promise<AttendeeEntity[]> {
    if (meetingIds.length === 0) return [];
    return (await prisma.meetingAttendee.findMany({ where: { meetingId: { in: meetingIds }, userId, removedAt: null } })).map(toAttendee);
  }

  async countRsvp(meetingId: string): Promise<Record<"PENDING" | "ACCEPTED" | "DECLINED" | "TENTATIVE", number>> {
    const kinds = ["PENDING", "ACCEPTED", "DECLINED", "TENTATIVE"] as const;
    const counts = await Promise.all(kinds.map((rsvp) => prisma.meetingAttendee.count({ where: { meetingId, removedAt: null, rsvp } })));
    return { PENDING: counts[0]!, ACCEPTED: counts[1]!, DECLINED: counts[2]!, TENTATIVE: counts[3]! };
  }

  async findOpenByWorkspace(workspaceId: string): Promise<MeetingEntity[]> {
    return (await prisma.meeting.findMany({ where: { workspaceId, deletedAt: null, status: { in: [...OPEN] } } })).map(toMeeting);
  }

  async findOpenOfUserInWorkspace(workspaceId: string, userId: string): Promise<MeetingEntity[]> {
    const rows = await prisma.meetingAttendee.findMany({ where: { workspaceId, userId, removedAt: null, meetingStatus: { in: [...OPEN] } }, select: { meetingId: true } });
    if (rows.length === 0) return [];
    return (await prisma.meeting.findMany({ where: { id: { in: rows.map((r) => r.meetingId) }, deletedAt: null, status: { in: [...OPEN] } } })).map(toMeeting);
  }

  async findScheduledBetween(from: Date, to: Date, limit: number): Promise<MeetingEntity[]> {
    return (await prisma.meeting.findMany({ where: { status: "SCHEDULED", deletedAt: null, startAt: { gte: from, lte: to } }, orderBy: { startAt: "asc" }, take: limit })).map(toMeeting);
  }

  async findLive(limit: number): Promise<MeetingEntity[]> {
    return (await prisma.meeting.findMany({ where: { status: "LIVE", deletedAt: null }, orderBy: { startedAt: "asc" }, take: limit })).map(toMeeting);
  }

  async createMeeting(tx: TxHandle, m: NewMeeting): Promise<MeetingEntity> {
    try {
      const row = await tx.meeting.create({ data: { ...m } });
      return toMeeting(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new MeetingCodeConflictError();
      throw err;
    }
  }

  async createAttendees(tx: TxHandle, list: NewAttendee[]): Promise<void> {
    if (list.length === 0) return;
    try {
      await tx.meetingAttendee.createMany({
        data: list.map((a) => ({
        meetingId: a.meetingId,
        workspaceId: a.workspaceId,
        userId: a.userId,
        role: a.role,
        rsvp: a.rsvp,
        rsvpAt: a.rsvpAt ?? null,
        source: a.source,
        invitedBy: a.invitedBy,
        removedAt: null,
        removedBy: null,
        firstJoinedAt: null,
        attendedSeconds: 0,
        meetingStartAt: a.meetingStartAt,
        meetingEndAt: a.meetingEndAt,
        meetingStatus: a.meetingStatus,
      })),
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new AttendeeConflictError();
      throw err;
    }
  }

  async updateMeeting(
    tx: TxHandle | undefined,
    id: string,
    expectedVersion: number | undefined,
    patch: MeetingPatch,
    cas: { statusIn?: MeetingStatusValue[] } = {}
  ): Promise<MeetingEntity | null> {
    const db = this.db(tx);
    const res = await db.meeting.updateMany({
      where: { id, ...(expectedVersion !== undefined ? { version: expectedVersion } : {}), ...(cas.statusIn ? { status: { in: cas.statusIn } } : {}) },
      data: { ...patch, version: { increment: 1 } },
    });
    if (res.count === 0) return null;
    const row = await db.meeting.findUnique({ where: { id } });
    return row ? toMeeting(row) : null;
  }

  async updateAttendee(tx: TxHandle | undefined, meetingId: string, userId: string, patch: AttendeePatch): Promise<AttendeeEntity | null> {
    const db = this.db(tx);
    const res = await db.meetingAttendee.updateMany({ where: { meetingId, userId }, data: { ...patch } });
    if (res.count === 0) return null;
    const row = await db.meetingAttendee.findUnique({ where: { meetingId_userId: { meetingId, userId } } });
    return row ? toAttendee(row) : null;
  }

  async markFirstJoined(meetingId: string, userId: string, at: Date): Promise<boolean> {
    const res = await prisma.meetingAttendee.updateMany({ where: { meetingId, userId, firstJoinedAt: null }, data: { firstJoinedAt: at } });
    return res.count > 0;
  }

  async updateAttendeesDenorm(tx: TxHandle, meetingId: string, patch: Pick<AttendeePatch, "meetingStartAt" | "meetingEndAt" | "meetingStatus">): Promise<void> {
    await tx.meetingAttendee.updateMany({ where: { meetingId }, data: { ...patch } });
  }

  async adjustAttendeeCount(tx: TxHandle, id: string, delta: number, max: number): Promise<boolean> {
    const where: Prisma.MeetingWhereInput = delta >= 0 ? { id, attendeeCount: { lte: max - delta } } : { id, attendeeCount: { gte: -delta } };
    const res = await tx.meeting.updateMany({ where, data: { attendeeCount: { increment: delta }, version: { increment: 1 } } });
    return res.count > 0;
  }

  async setConversationIfUnset(id: string, conversationId: string): Promise<boolean> {
    const res = await prisma.meeting.updateMany({ where: { id, conversationId: null }, data: { conversationId } });
    return res.count > 0;
  }
}
