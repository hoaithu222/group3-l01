import { Prisma, type CalendarEventLink } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { CalendarLinkEntity } from "../entities/integration.interface";
import type { ICalendarLinkRepository, UpsertCalendarLinkInput } from "./calendar-link.repository.interface";

function toEntity(row: CalendarEventLink): CalendarLinkEntity {
  return {
    id: row.id,
    meetingId: row.meetingId,
    userId: row.userId,
    userIntegrationId: row.userIntegrationId,
    externalEventId: row.externalEventId,
    etag: row.etag,
    syncedVersion: row.syncedVersion,
    deletedAt: row.deletedAt,
  };
}

export class PrismaCalendarLinkRepository implements ICalendarLinkRepository {
  async find(meetingId: string, userId: string): Promise<CalendarLinkEntity | null> {
    const row = await prisma.calendarEventLink.findFirst({ where: { meetingId, userId } });
    return row ? toEntity(row) : null;
  }

  async upsert(input: UpsertCalendarLinkInput): Promise<CalendarLinkEntity> {
    const existing = await prisma.calendarEventLink.findFirst({ where: { meetingId: input.meetingId, userId: input.userId } });
    const data = {
      userIntegrationId: input.userIntegrationId,
      externalEventId: input.externalEventId,
      etag: input.etag,
      syncedVersion: input.syncedVersion,
      deletedAt: null,
    };
    try {
      const row = existing
        ? await prisma.calendarEventLink.update({ where: { id: existing.id }, data })
        : await prisma.calendarEventLink.create({ data: { meetingId: input.meetingId, userId: input.userId, ...data } });
      return toEntity(row);
    } catch (err) {
      // Hai job cùng (meetingId, userId) tạo song song: bên thua thấy hàng đã có → cập nhật.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const row = await prisma.calendarEventLink.findFirstOrThrow({ where: { meetingId: input.meetingId, userId: input.userId } });
        return toEntity(await prisma.calendarEventLink.update({ where: { id: row.id }, data }));
      }
      throw err;
    }
  }

  async markDeleted(id: string, syncedVersion: number): Promise<void> {
    await prisma.calendarEventLink.updateMany({ where: { id }, data: { deletedAt: new Date(), syncedVersion } });
  }

  async listLiveByMeeting(meetingId: string): Promise<CalendarLinkEntity[]> {
    const rows = await prisma.calendarEventLink.findMany({ where: { meetingId, deletedAt: null } });
    return rows.map(toEntity);
  }

  async listLiveByUserIntegration(userIntegrationId: string, limit: number): Promise<CalendarLinkEntity[]> {
    const rows = await prisma.calendarEventLink.findMany({ where: { userIntegrationId, deletedAt: null }, take: limit });
    return rows.map(toEntity);
  }

  async deleteByUserIntegration(userIntegrationId: string): Promise<number> {
    const res = await prisma.calendarEventLink.deleteMany({ where: { userIntegrationId } });
    return res.count;
  }
}
