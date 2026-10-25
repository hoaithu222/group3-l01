/**
 * Kiểu dữ liệu tab "Cuộc họp" của phân hệ `meeting` (p2-07) — khớp DTO `AdminMeetingRow` / `AdminMeetingDetail` và query của
 * `GET /admin/meetings` phía BE (`be/src/modules/admin-media-ops/entities/admin-media.types.ts`, `dtos/admin-meeting.dto.ts`).
 *
 * CHỈ metadata vận hành: BE cố ý KHÔNG trả agenda, địa điểm, đường dẫn phòng họp, danh sách người tham dự hay nội dung biên bản
 * (OPC-05). Đừng thêm các trường đó vào đây; đổi hợp đồng thì đối chiếu lại file BE trên. Chuỗi thời gian là ISO 8601.
 */
import type { CallEndReasonValue } from './call.types';

export type MeetingStatusValue = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
export type MeetingPlatformValue = 'INTERNAL' | 'ZOOM' | 'TEAMS' | 'GOOGLE_MEET' | 'OTHER';
export type MeetingEndReasonValue =
  'HOST_ENDED' | 'EMPTY' | 'MAX_DURATION' | 'FORCE_ENDED' | 'WORKSPACE_ARCHIVED' | 'HOST_REMOVED';

/** Khoá sắp xếp BE nhận (`-` = giảm dần). */
export type MeetingSortValue = '-startAt' | 'startAt' | '-attendeeCount';

/** `name` = `null` khi tài khoản/nhóm không còn. */
export interface MeetingNamedRef {
  id: string;
  name: string | null;
}

export interface AdminMeetingRow {
  id: string;
  /** Mã họp dạng `abc-defg-hij` — dùng tra cứu khi hỗ trợ người dùng. */
  code: string;
  title: string;
  workspace: MeetingNamedRef;
  host: MeetingNamedRef;
  startAt: string;
  endAt: string;
  /** Múi giờ IANA của cuộc họp. */
  timezone: string;
  status: MeetingStatusValue;
  platform: MeetingPlatformValue;
  attendeeCount: number;
  sessionCount: number;
  totalDurationSec: number;
  recordingCount: number;
  endReason?: MeetingEndReasonValue;
  cancelledAt?: string;
}

export interface AdminMeetingSession {
  callId: string;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  peakParticipants: number;
  endReason?: CallEndReasonValue;
}

export interface AdminMeetingDetail extends AdminMeetingRow {
  /** Chỉ có khi đang họp. */
  currentSession?: { callId: string; startedAt: string; connectedCount: number; lockedAt?: string };
  /** Tối đa 20 phiên gần nhất. */
  sessions: AdminMeetingSession[];
  recordings: { ready: number; failed: number; totalBytes: number };
}

/** `GET /admin/meetings` — `status` là CSV (`LIVE,SCHEDULED`); `q` 2–100 ký tự; `from`/`to` lọc theo giờ BẮT ĐẦU (ISO). */
export interface AdminMeetingListParams {
  page: number;
  limit: number;
  q?: string;
  workspaceId?: string;
  status?: string;
  platform?: MeetingPlatformValue;
  from?: string;
  to?: string;
  sort: MeetingSortValue;
}

/**
 * Payload sự kiện `admin:media-updated` (room `admin:media`, guard `meeting:view`): CHỈ tín hiệu để làm mới bảng — không nội dung, không người dùng.
 * BE gộp theo `kind` (tối đa một sự kiện/giây) nên đừng dựa vào nó làm nguồn dữ liệu; luôn tải lại qua REST.
 */
export interface AdminMediaUpdatedPayload {
  v: number;
  serverNow: string;
  kind: 'MEETING' | 'CALL' | 'RECORDING';
  id: string;
  status: string;
}
