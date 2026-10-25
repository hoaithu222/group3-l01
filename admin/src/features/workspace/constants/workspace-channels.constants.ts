import type {
  ChannelStatusValue,
  ChannelTypeValue,
  PostingPolicyValue,
} from '../types/workspace-channels.types';

/**
 * Nhãn cột "Loại" — admin.md p1-03 §2.1 ghi rõ cột này là "chữ" (KHÔNG phải
 * Badge, khác cột "Trạng thái"). Icon đi kèm khai riêng ở
 * `workspace-channel-table.columns.tsx` (gắn cạnh tên kênh).
 */
export const CHANNEL_TYPE_LABELS: Record<ChannelTypeValue, string> = {
  TEXT: 'Văn bản',
  VOICE: 'Thoại',
  POMODORO: 'Pomodoro',
};

/** admin.md p1-03 §2.1 — nhãn đúng nguyên văn "Mọi thành viên / Chỉ quản trị". */
export const CHANNEL_POSTING_POLICY_LABELS: Record<PostingPolicyValue, string> = {
  MEMBERS: 'Mọi thành viên',
  ADMINS_ONLY: 'Chỉ quản trị',
};

export const CHANNEL_STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: ChannelStatusValue; label: string }> = [
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'ARCHIVED', label: 'Lưu trữ' },
];

export const CHANNEL_TYPE_FILTER_OPTIONS: ReadonlyArray<{ value: ChannelTypeValue; label: string }> = [
  { value: 'TEXT', label: CHANNEL_TYPE_LABELS.TEXT },
  { value: 'VOICE', label: CHANNEL_TYPE_LABELS.VOICE },
  { value: 'POMODORO', label: CHANNEL_TYPE_LABELS.POMODORO },
];

/**
 * BE chỉ `validateQuery(paginationSchema)` (không `status`/`type` như p1-02 `AdminListMembersParams`) — không có
 * lọc trạng thái/loại phía server. Response NAY có `meta.total` (thêm sau khi phát hiện `adminListPublic()` đã
 * tự tính `total` nhưng controller bỏ qua, README p1-03 §10) nhưng vẫn gọi MỘT LẦN với `limit` tối đa BE cho
 * phép rồi tự lọc/sắp/phân trang phía client — đổi sang lọc trạng thái/loại thật ở server cần thêm query schema
 * mới (việc riêng), chính xác trong phạm vi `CHANNEL_FETCH_LIMIT` kênh public đầu; `meta.total` dùng để cảnh báo
 * khi vượt ngưỡng đó (workspace nhiều kênh archived theo thời gian).
 */
export const CHANNEL_FETCH_LIMIT = 100;
