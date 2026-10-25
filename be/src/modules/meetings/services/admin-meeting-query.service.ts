import { NotFoundError } from "../../../core/exceptions";
import type { AdminWorkspaceMeetingsQueryDto } from "../dtos";
import type { MeetingEndReasonValue, MeetingPlatformValue, MeetingStatusValue } from "../entities/meeting.interface";
import type { AdminMeetingRecord, IAdminMeetingReader } from "../repositories/admin-meeting.reader";

/**
 * Một dòng cuộc họp cho tab "Cuộc họp" của trang workspace ở admin (admin.md p2-04 §2.1) — CHỈ metadata.
 * Cố ý không có `code`, `agenda`, `location`, `externalUrl`, danh sách người tham dự, `conversationId`: admin nền tảng không cần và không được xem
 * nội dung cuộc họp (D-24). `recordingCount` chưa có vì `MeetingRecording` thuộc p2-06 (chưa dựng); force-end ở p2-07.
 */
export interface AdminMeetingRow {
  id: string;
  title: string;
  host: { id: string; name: string | null };
  startAt: string;
  endAt: string;
  timezone: string;
  status: MeetingStatusValue;
  platform: MeetingPlatformValue;
  attendeeCount: number;
  endReason: MeetingEndReasonValue | null;
  cancelledAt: string | null;
}

const toRow = (r: AdminMeetingRecord, hostName: string | undefined): AdminMeetingRow => ({
  id: r.id,
  title: r.title,
  host: { id: r.hostId, name: hostName ?? null },
  startAt: r.startAt.toISOString(),
  endAt: r.endAt.toISOString(),
  timezone: r.timezone,
  status: r.status,
  platform: r.platform,
  attendeeCount: r.attendeeCount,
  endReason: r.endReason,
  cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
});

/** Đọc lịch họp của MỘT workspace cho admin nền tảng (`workspace:view`). Chỉ đọc, không audit (không thao tác ghi). */
export class AdminMeetingQueryService {
  constructor(private readonly reader: IAdminMeetingReader) {}

  async listByWorkspace(workspaceId: string, q: AdminWorkspaceMeetingsQueryDto) {
    if (!(await this.reader.workspaceExists(workspaceId))) throw new NotFoundError("Không tìm thấy workspace");
    const { rows, total } = await this.reader.listByWorkspace({ workspaceId, statuses: q.status, from: q.from, to: q.to, page: q.page, limit: q.limit });
    const hosts = await this.reader.getHostNames(rows.map((r) => r.hostId));
    const totalPages = Math.max(1, Math.ceil(total / q.limit));
    return {
      data: rows.map((r) => toRow(r, hosts.get(r.hostId))),
      meta: { page: q.page, limit: q.limit, total, totalPages, hasNext: q.page < totalPages, hasPrev: q.page > 1 },
    };
  }
}
