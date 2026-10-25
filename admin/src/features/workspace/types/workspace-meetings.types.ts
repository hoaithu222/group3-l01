/**
 * Kiểu dữ liệu tab `meetings` — khớp `AdminMeetingRow` phía BE
 * (`be/src/modules/meetings/services/admin-meeting-query.service.ts`, p2-04 admin.md §2.1).
 *
 * CHỈ metadata: BE cố ý KHÔNG trả `code`, `agenda`, `location`, `externalUrl`, danh sách người tham dự (D-24) — đừng thêm các trường đó vào
 * đây; đổi hợp đồng thì đối chiếu lại `admin-meeting.reader.ts` (select tối thiểu). `recordingCount` chưa có: `MeetingRecording` thuộc p2-06.
 */

export type MeetingStatusValue = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
export type MeetingPlatformValue = 'INTERNAL' | 'ZOOM' | 'TEAMS' | 'GOOGLE_MEET' | 'OTHER';
export type MeetingEndReasonValue =
  | 'HOST_ENDED'
  | 'EMPTY'
  | 'MAX_DURATION'
  | 'FORCE_ENDED'
  | 'WORKSPACE_ARCHIVED'
  | 'HOST_REMOVED';

export interface AdminMeetingRow {
  id: string;
  title: string;
  /** `name` = `null` khi tài khoản chủ trì không còn. */
  host: { id: string; name: string | null };
  /** ISO UTC. */
  startAt: string;
  endAt: string;
  /** IANA của cuộc họp (do người tạo chọn). */
  timezone: string;
  status: MeetingStatusValue;
  platform: MeetingPlatformValue;
  attendeeCount: number;
  endReason: MeetingEndReasonValue | null;
  cancelledAt: string | null;
}

/** `GET /admin/workspaces/:workspaceId/meetings` — `startAt` mới → cũ; `from`/`to` lọc theo GIỜ BẮT ĐẦU (ISO, gồm hai đầu). */
export interface AdminMeetingListParams {
  page: number;
  limit: number;
  status?: MeetingStatusValue;
  from?: string;
  to?: string;
}
