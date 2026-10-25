import type {
  MeetingEndReasonValue,
  MeetingPlatformValue,
  MeetingStatusValue,
} from '../types/meeting.types';

/** Số liệu chưa có (đang tải / tải lỗi / mẫu số 0) — hiện `—`, KHÔNG bao giờ `0` (api-patterns.md, trạng thái lỗi tải). */
export const NO_DATA = '—';

/** Gốc đường dẫn của phân hệ — viết thẳng chuỗi, KHÔNG import `MODULE_PATHS` (trang của phân hệ nằm trên nhánh `page.lazy` của registry: import ngược khép vòng `check:cycles`). */
export const MEETING_BASE_PATH = '/meeting';

/** Cờ tính năng ở BE (`capabilities.features`): cả phân hệ cần `meeting`; nhánh cuộc gọi cần thêm `voice`. */
export const MEETING_FEATURE_FLAG = 'meeting';
export const VOICE_FEATURE_FLAG = 'voice';

/** Cờ tắt giữa chừng (capabilities cache 5 phút) → BE trả 404 với mã này: hiện "đang tắt", không phải lỗi. */
export const FEATURE_OFF_CODE = 'CFG_005';

/** Khoá tab (đúng giá trị `?tab=` và `tabTitles` của `meeting.routes.tsx`). */
export const MEETING_OPS_TAB = {
  meetings: 'meetings',
  calls: 'calls',
  recordings: 'recordings',
  infra: 'infra',
} as const;

/** Khoá URL dùng CHUNG giữa các tab (đổi tab thì xoá sạch để bộ lọc tab này không lọt sang tab kia). */
export const MEETING_URL_KEYS = {
  search: 'q',
  pageSize: 'limit',
  workspace: 'workspaceId',
  /** Chỉ tab "Ghi hình" dùng (lọc theo MỘT cuộc họp, đến từ ngăn kéo cuộc họp); tab "Cuộc gọi" có khoá `meetingId` riêng cùng tên. */
  meeting: 'meetingId',
  status: 'status',
  from: 'from',
  to: 'to',
  sort: 'sort',
  detail: 'id',
  platform: 'platform',
} as const;

/** Dòng mỗi trang: mặc định 20, trần 50 (`LIMITS.adminMedia.listLimitMax` ở BE). */
export const MEETING_PAGE_SIZE = 20;
export const MEETING_PAGE_SIZE_OPTIONS = [20, 50];

/** Staleness (admin.md p2-07 §3): danh sách 30 giây; thống kê 5 phút khớp cache BE; sức khoẻ media 15 giây. */
export const LIST_STALE_MS = 30_000;
export const CALL_STATS_STALE_MS = 5 * 60_000;
export const MEDIA_HEALTH_REFRESH_MS = 15_000;

/** Lỗi kết thúc cuộc họp mà thử lại cũng vẫn thế (`MEET_009` không còn LIVE, `MEET_001` không còn) — đóng hộp thoại thay vì giữ mở. */
export const MEETING_FORCE_END_FINAL_CODES: readonly string[] = ['MEET_009', 'MEET_001'];

export const ALL_FILTER = 'all';

export const MEETING_PLATFORM_LABELS: Record<MeetingPlatformValue, string> = {
  INTERNAL: 'Nội bộ',
  ZOOM: 'Zoom',
  TEAMS: 'Microsoft Teams',
  GOOGLE_MEET: 'Google Meet',
  OTHER: 'Khác',
};

export const MEETING_PLATFORM_OPTIONS = [
  { value: ALL_FILTER, label: 'Mọi nền tảng' },
  ...(Object.entries(MEETING_PLATFORM_LABELS) as Array<[MeetingPlatformValue, string]>).map(
    ([value, label]) => ({ value, label }),
  ),
];

/** Vì sao cuộc họp kết thúc — chỉ hiện cạnh trạng thái "Đã kết thúc". */
export const MEETING_END_REASON_LABELS: Record<MeetingEndReasonValue, string> = {
  HOST_ENDED: 'Chủ trì kết thúc',
  EMPTY: 'Phòng không còn ai',
  MAX_DURATION: 'Quá thời lượng tối đa',
  FORCE_ENDED: 'Quản trị viên kết thúc',
  WORKSPACE_ARCHIVED: 'Nhóm bị lưu trữ',
  HOST_REMOVED: 'Chủ trì rời nhóm',
};

/** Ô lọc trạng thái (nhãn chữ khớp `statusBadge('meeting', …)`). */
export const MEETING_STATUS_OPTIONS: ReadonlyArray<{ value: MeetingStatusValue; label: string }> = [
  { value: 'SCHEDULED', label: 'Sắp tới' },
  { value: 'LIVE', label: 'Đang diễn ra' },
  { value: 'ENDED', label: 'Đã kết thúc' },
  { value: 'CANCELLED', label: 'Đã huỷ' },
];

/** Cột sắp xếp được ↔ khoá `sort` của BE. `attendeeCount` chỉ có chiều giảm dần. Mặc định: bắt đầu mới → cũ. */
export const MEETING_SORT_SPEC = {
  keys: ['startAt', 'attendeeCount'],
  descOnly: ['attendeeCount'],
  defaultSort: { key: 'startAt', dir: 'desc' },
} as const;

/** Chú thích quyền riêng tư đầu tab (OPC-05) — nói thẳng admin KHÔNG xem được gì để không ai hiểu nhầm là thiếu tính năng. */
export const MEETING_PRIVACY_NOTE =
  'Vì quyền riêng tư, trang quản trị chỉ hiển thị thông tin vận hành của cuộc họp (tiêu đề, giờ, chủ trì, trạng thái, số người, phiên họp). Nội dung chương trình, địa điểm, đường dẫn phòng họp, danh sách người tham dự và biên bản không được hiển thị.';

/** Hộp thoại "Kết thúc cuộc họp" (admin.md p2-07 §2.2). */
export const MEETING_FORCE_END_IMPACT =
  'Mọi người bị đưa ra khỏi phòng và phòng đóng ngay; hành động được ghi vào nhật ký quản trị. Chủ trì có thể bắt đầu lại trong thời gian cho phép.';
