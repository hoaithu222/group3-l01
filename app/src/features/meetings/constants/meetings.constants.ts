import type {
  MeetingFormat,
  MeetingLobbyMode,
  MeetingNotifyVia,
  MeetingPlatform,
  MeetingRsvp,
  MeetingStatus,
  MeetingVisibility,
} from '../api/meetings.types';

/** Nhãn hiển thị + giới hạn của module họp (khớp `LIMITS.meeting` của BE, README p2-04 §7). Tiếng Việt, một chỗ. */

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  CANCELLED: 'Đã huỷ',
  ENDED: 'Đã kết thúc',
  LIVE: 'Đang diễn ra',
  SCHEDULED: 'Sắp tới',
};

export const FORMAT_LABEL: Record<MeetingFormat, string> = {
  HYBRID: 'Kết hợp',
  OFFLINE: 'Trực tiếp',
  ONLINE: 'Trực tuyến',
};

export const PLATFORM_LABEL: Record<MeetingPlatform, string> = {
  GOOGLE_MEET: 'Google Meet',
  INTERNAL: 'Phòng nội bộ',
  OTHER: 'Khác',
  TEAMS: 'Microsoft Teams',
  ZOOM: 'Zoom',
};

export const RSVP_LABEL: Record<MeetingRsvp, string> = {
  ACCEPTED: 'Tham dự',
  DECLINED: 'Không tham dự',
  PENDING: 'Chưa phản hồi',
  TENTATIVE: 'Có thể',
};

export const VISIBILITY_LABEL: Record<MeetingVisibility, string> = {
  ATTENDEES: 'Chỉ người được mời',
  WORKSPACE: 'Cả nhóm',
};

export const LOBBY_LABEL: Record<MeetingLobbyMode, string> = {
  ALL: 'Tất cả',
  NON_ATTENDEES: 'Người ngoài danh sách',
  OFF: 'Tắt',
};

export const NOTIFY_LABEL: Record<MeetingNotifyVia, string> = {
  APP: 'Ứng dụng',
  BOTH: 'Cả hai',
  CHAT: 'Nhóm chat',
};

/** `LIMITS.meeting.reminderOptionsMinutes` — BE từ chối mốc ngoài danh sách (`Mốc nhắc không hỗ trợ`). */
export const REMINDER_OPTIONS: readonly number[] = [5, 10, 15, 30, 60, 1440];
export const REMINDERS_MAX = 3;

export function reminderLabel(minutes: number): string {
  if (minutes >= 1440) return `${String(minutes / 1440)} ngày`;
  if (minutes >= 60) return `${String(minutes / 60)} giờ`;
  return `${String(minutes)} phút`;
}

/** Thời lượng nhanh (phút) ở form. */
export const DURATION_PRESETS: readonly number[] = [30, 45, 60, 90];

export const TITLE_MAX = 255;
export const AGENDA_MAX = 2000;
export const LOCATION_MAX = 255;
/** `LIMITS.meeting.attendeesMax`. */
export const ATTENDEES_MAX = 200;

/** Múi giờ rút gọn (VN, SG, JP, KR, AU, EU, US) — README p2-04 §6; tìm theo tên/IANA. */
export const TIMEZONE_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'Asia/Ho_Chi_Minh', label: 'Việt Nam (Hà Nội, TP.HCM)' },
  { id: 'Asia/Bangkok', label: 'Bangkok' },
  { id: 'Asia/Singapore', label: 'Singapore' },
  { id: 'Asia/Tokyo', label: 'Tokyo' },
  { id: 'Asia/Seoul', label: 'Seoul' },
  { id: 'Australia/Sydney', label: 'Sydney' },
  { id: 'Europe/London', label: 'London' },
  { id: 'Europe/Paris', label: 'Paris / Berlin' },
  { id: 'America/New_York', label: 'New York' },
  { id: 'America/Los_Angeles', label: 'Los Angeles' },
  { id: 'UTC', label: 'UTC' },
];

/** `LIMITS.meeting.coHostsMax` — BE từ chối cấp thêm đồng chủ trì khi đủ (`MEET_005`). */
export const COHOSTS_MAX = 10;

/**
 * Tên NGẮN của múi giờ để viết "09:00 giờ Hà Nội" (README p2-04 §2 "Múi giờ", MT-19). Múi giờ ngoài bảng này rơi về phần cuối
 * của mã IANA (`Africa/Cairo` → "Cairo") — Hermes không có tên vùng đầy đủ đáng tin ở mọi máy.
 */
export const TIMEZONE_SHORT: Record<string, string> = {
  'America/Los_Angeles': 'Los Angeles',
  'America/New_York': 'New York',
  'Asia/Bangkok': 'Bangkok',
  'Asia/Ho_Chi_Minh': 'Hà Nội',
  'Asia/Seoul': 'Seoul',
  'Asia/Singapore': 'Singapore',
  'Asia/Tokyo': 'Tokyo',
  'Australia/Sydney': 'Sydney',
  'Europe/London': 'London',
  'Europe/Paris': 'Paris',
  UTC: 'UTC',
};

/** Nhãn nút vào theo cách server cho vào (`myActions.joinVia`). */
export const JOIN_LABEL: Record<'DIRECT' | 'LOBBY' | 'WAIT_FOR_HOST', string> = {
  DIRECT: 'Vào cuộc họp',
  LOBBY: 'Xin vào cuộc họp',
  WAIT_FOR_HOST: 'Vào phòng chờ',
};

/** Tên thứ viết tắt, thứ hai đứng đầu (dải tuần + lưới tháng). */
export const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;
