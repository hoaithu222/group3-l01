import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { MeetingEndReasonValue, MeetingPlatformValue, MeetingStatusValue } from "../entities/meeting.interface";

/**
 * Bản ghi cuộc họp CHO ADMIN — chỉ metadata. Cố ý KHÔNG có `agenda`, `location`, `externalUrl`, `code`, danh sách người tham dự, `conversationId`…:
 * `select` ở `PrismaAdminMeetingReader` chỉ lấy đúng các trường này nên dù sau này ai đó thêm DTO cũng không có dữ liệu nhạy cảm để lộ (p2-07 be.md §5.1).
 */
export interface AdminMeetingRecord {
  id: string;
  title: string;
  hostId: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: MeetingStatusValue;
  platform: MeetingPlatformValue;
  attendeeCount: number;
  endReason: MeetingEndReasonValue | null;
  cancelledAt: Date | null;
}

export interface AdminMeetingFilter {
  workspaceId: string;
  statuses?: MeetingStatusValue[];
  /** `startAt ∈ [from, to]` (bao gồm hai đầu). */
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

/** Cổng ĐỌC-CHỈ cho admin (không có hàm ghi) — tách khỏi `IMeetingRepository` để không lẫn với đường nghiệp vụ của người dùng. */
export interface IAdminMeetingReader {
  workspaceExists(workspaceId: string): Promise<boolean>;
  /** Cuộc họp chưa xoá mềm của workspace, `startAt` mới → cũ (tie-break `id`). */
  listByWorkspace(f: AdminMeetingFilter): Promise<{ rows: AdminMeetingRecord[]; total: number }>;
  /** Tên hiển thị của các chủ trì (chỉ id + tên — không email). */
  getHostNames(userIds: string[]): Promise<Map<string, string>>;
}

export class PrismaAdminMeetingReader implements IAdminMeetingReader {
  async workspaceExists(workspaceId: string): Promise<boolean> {
    return (await prisma.workspace.count({ where: { id: workspaceId } })) > 0;
  }

  async listByWorkspace(f: AdminMeetingFilter): Promise<{ rows: AdminMeetingRecord[]; total: number }> {
    // `deletedAt: null` khớp vì `createMeeting` ghi null TƯỜNG MINH (Prisma+Mongo: vắng mặt ≠ null).
    const where: Prisma.MeetingWhereInput = {
      workspaceId: f.workspaceId,
      deletedAt: null,
      ...(f.statuses && f.statuses.length > 0 ? { status: { in: f.statuses } } : {}),
      ...(f.from || f.to ? { startAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        orderBy: [{ startAt: "desc" }, { id: "desc" }],
        skip: (f.page - 1) * f.limit,
        take: f.limit,
        select: { id: true, title: true, hostId: true, startAt: true, endAt: true, timezone: true, status: true, platform: true, attendeeCount: true, endReason: true, cancelledAt: true },
      }),
      prisma.meeting.count({ where }),
    ]);
    return { rows, total };
  }

  async getHostNames(userIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(rows.map((u) => [u.id, u.name]));
  }
}
