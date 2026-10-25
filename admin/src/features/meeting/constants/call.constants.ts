import type {
  CallEndReasonValue,
  CallMediaKindValue,
  CallModeValue,
  CallScopeTypeValue,
  CallStatusValue,
} from '../types/call.types';
import { ALL_FILTER } from './meeting.constants';

export const CALL_SCOPE_LABELS: Record<CallScopeTypeValue, string> = {
  CONVERSATION: 'Hội thoại',
  CHANNEL: 'Kênh',
  MEETING: 'Cuộc họp',
};

export const CALL_MODE_LABELS: Record<CallModeValue, string> = {
  RING: 'Đổ chuông',
  ROOM: 'Phòng',
};

export const CALL_MEDIA_LABELS: Record<CallMediaKindValue, string> = {
  AUDIO: 'Thoại',
  VIDEO: 'Video',
};

const toOptions = <T extends string>(labels: Record<T, string>, allLabel: string) => [
  { value: ALL_FILTER, label: allLabel },
  ...(Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label })),
];

export const CALL_SCOPE_OPTIONS = toOptions(CALL_SCOPE_LABELS, 'Mọi phạm vi');
export const CALL_MODE_OPTIONS = toOptions(CALL_MODE_LABELS, 'Mọi chế độ');
export const CALL_MEDIA_OPTIONS = toOptions(CALL_MEDIA_LABELS, 'Thoại và video');

/** Ô lọc trạng thái (chữ khớp `statusBadge('call', …)`). */
export const CALL_STATUS_OPTIONS: ReadonlyArray<{ value: CallStatusValue; label: string }> = [
  { value: 'RINGING', label: 'Đang đổ chuông' },
  { value: 'ACTIVE', label: 'Đang diễn ra' },
  { value: 'ENDED', label: 'Đã kết thúc' },
];

/** Ô lọc lý do kết thúc (chữ khớp `statusBadge('callEndReason', …)`). */
export const CALL_END_REASON_OPTIONS: ReadonlyArray<{ value: CallEndReasonValue; label: string }> =
  [
    { value: 'COMPLETED', label: 'Hoàn tất' },
    { value: 'CANCELLED', label: 'Người gọi huỷ' },
    { value: 'NO_ANSWER', label: 'Không trả lời' },
    { value: 'DECLINED', label: 'Bị từ chối' },
    { value: 'BUSY', label: 'Máy bận' },
    { value: 'FAILED', label: 'Lỗi' },
    { value: 'REVOKED', label: 'Mất quyền' },
    { value: 'ARCHIVED', label: 'Đã lưu trữ' },
    { value: 'HOST_ENDED', label: 'Chủ trì kết thúc' },
    { value: 'FORCE_ENDED', label: 'Quản trị kết thúc' },
    { value: 'EMPTY', label: 'Không còn ai' },
    { value: 'MAX_DURATION', label: 'Quá thời lượng' },
  ];

/** Cột sắp xếp được ↔ khoá `sort` của BE. `durationSec`/`peakParticipants` chỉ có chiều giảm dần. Mặc định: bắt đầu mới → cũ. */
export const CALL_SORT_SPEC = {
  keys: ['startedAt', 'durationSec', 'peakParticipants'],
  descOnly: ['durationSec', 'peakParticipants'],
  defaultSort: { key: 'startedAt', dir: 'desc' },
} as const;

/** Khoảng thống kê chọn được (ngày) — BE trần 92 ngày. */
export const CALL_STATS_DAY_OPTIONS = [
  { key: '7', label: '7 ngày' },
  { key: '30', label: '30 ngày' },
  { key: '90', label: '90 ngày' },
];
export const CALL_STATS_DEFAULT_DAYS = 7;

/** Lỗi kết thúc cuộc gọi mà thử lại cũng vẫn thế — đóng hộp thoại (`ADMIN_MEDIA_002` có khung riêng "Mở cuộc họp"). */
export const CALL_FORCE_END_FINAL_CODES: readonly string[] = ['CALL_005', 'ADMIN_MEDIA_002'];
export const CALL_BELONGS_TO_MEETING_CODE = 'ADMIN_MEDIA_002';

export const CALL_PRIVACY_NOTE =
  'Vì quyền riêng tư, cuộc gọi 1-1 hiện là "Cuộc gọi 1-1", nhóm chat là "Nhóm chat", kênh riêng tư là "Kênh riêng tư"; không có danh sách người tham gia và không lọc được theo người dùng.';

export const CALL_FORCE_END_IMPACT =
  'Cuộc gọi kết thúc cho mọi người tham gia ngay lập tức; hành động được ghi vào nhật ký quản trị. Không thể hoàn tác.';

/** Tên gọi từng chỉ số người tham gia ở ngăn kéo chi tiết (`participantStats`). */
export const CALL_PARTICIPANT_STAT_LABELS = [
  ['invited', 'Được mời'],
  ['answered', 'Đã trả lời'],
  ['connected', 'Đã kết nối'],
  ['missed', 'Nhỡ'],
  ['declined', 'Từ chối'],
  ['busy', 'Bận'],
  ['removed', 'Bị mời ra'],
] as const;
