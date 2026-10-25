import { prisma } from "../../../infrastructure/database";
import type { CalendarMeetingInfo, IMeetingCalendarReader } from "./integration.ports";

/**
 * Đọc CHỈ-ĐỌC cuộc họp (p2-04) cho đồng bộ Google Calendar — cùng cách `PrismaIntegrationDirectory` đọc kênh/workspace: module tích hợp KHÔNG import
 * `modules/meetings` (chỉ nhận sự kiện qua `registerMeetingEventSink`) và KHÔNG ghi gì vào bảng họp. Người tham dự có hiệu lực: `removedAt = null`
 * (hoặc chưa từng ghi) và `rsvp ≠ DECLINED`.
 */
export class PrismaMeetingCalendarReader implements IMeetingCalendarReader {
  async getMeeting(meetingId: string): Promise<CalendarMeetingInfo | null> {
    const m = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        code: true,
        title: true,
        agenda: true,
        location: true,
        externalUrl: true,
        startAt: true,
        endAt: true,
        timezone: true,
        status: true,
        deletedAt: true,
        version: true,
      },
    });
    if (!m) return null;
    const attendees = await prisma.meetingAttendee.findMany({
      where: { meetingId, OR: [{ removedAt: null }, { removedAt: { isSet: false } }], rsvp: { not: "DECLINED" } },
      select: { userId: true },
    });
    const { deletedAt, ...rest } = m;
    return { ...rest, deleted: Boolean(deletedAt), attendeeIds: attendees.map((a) => a.userId) };
  }

  async listUpcomingForUser(userId: string, from: Date, limit: number): Promise<Array<{ meetingId: string; version: number }>> {
    const rows = await prisma.meetingAttendee.findMany({
      where: {
        userId,
        OR: [{ removedAt: null }, { removedAt: { isSet: false } }],
        rsvp: { not: "DECLINED" },
        meetingEndAt: { gt: from },
        meetingStatus: { in: ["SCHEDULED", "LIVE"] },
      },
      orderBy: { meetingStartAt: "asc" },
      take: limit,
      select: { meetingId: true },
    });
    if (rows.length === 0) return [];
    const meetings = await prisma.meeting.findMany({
      where: { id: { in: rows.map((r) => r.meetingId) }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: { id: true, version: true },
    });
    return meetings.map((m) => ({ meetingId: m.id, version: m.version }));
  }

  async endTimes(meetingIds: string[]): Promise<Map<string, Date>> {
    if (meetingIds.length === 0) return new Map();
    const rows = await prisma.meeting.findMany({ where: { id: { in: meetingIds } }, select: { id: true, endAt: true } });
    return new Map(rows.map((r) => [r.id, r.endAt]));
  }
}
