import type {
  MeetingEndReasonValue,
  MeetingPlatformValue,
  MeetingStatusValue,
} from '../types/workspace-meetings.types';

/** Dòng mỗi trang của tab "Cuộc họp" (admin.md p2-04 §2.1: tối đa 20; BE cho tới 50). */
export const MEETING_PAGE_SIZE = 20;

export const MEETING_PLATFORM_LABELS: Record<MeetingPlatformValue, string> = {
  INTERNAL: 'Nội bộ',
  ZOOM: 'Zoom',
  TEAMS: 'Microsoft Teams',
  GOOGLE_MEET: 'Google Meet',
  OTHER: 'Khác',
};

/** Vì sao cuộc họp kết thúc — chỉ hiện cạnh trạng thái "Đã kết thúc". */
export const MEETING_END_REASON_LABELS: Record<MeetingEndReasonValue, string> = {
  HOST_ENDED: 'Chủ trì kết thúc',
  EMPTY: 'Phòng không còn ai',
  MAX_DURATION: 'Quá thời lượng tối đa',
  FORCE_ENDED: 'Quản trị viên kết thúc',
  WORKSPACE_ARCHIVED: 'Nhóm bị lưu trữ',
  HOST_REMOVED: 'Chủ trì rời nhóm',
};

/** Nhãn ô lọc trạng thái (nhãn chữ khớp `statusBadge('meeting', …)`). */
export const MEETING_STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: MeetingStatusValue; label: string }> = [
  { value: 'SCHEDULED', label: 'Sắp tới' },
  { value: 'LIVE', label: 'Đang diễn ra' },
  { value: 'ENDED', label: 'Đã kết thúc' },
  { value: 'CANCELLED', label: 'Đã huỷ' },
];
