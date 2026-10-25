import type { CollabServiceStatus } from '../types/collab-ops.types';

/** Cờ tính năng ở BE (`capabilities.features`) — tab chỉ hiện khi cờ `collab` bật (admin.md p6-01 §1). */
export const COLLAB_FEATURE_FLAG = 'collab';

/** Số tài liệu lớn tối đa lấy về (BE `largeQuerySchema`: 1–50, mặc định 20) — admin.md §2.1 "top 20". */
export const LARGE_DOCUMENTS_LIMIT = 20;

/** Chu kỳ làm mới sức khoẻ/số liệu khi tab trình duyệt hiện (admin.md §3: health poll 30 s). */
export const COLLAB_REFRESH_MS = 30_000;

/** Trạng thái service → nhãn CHỮ + màu (không dựa vào màu đơn thuần). */
export const COLLAB_STATUS_META: Readonly<
  Record<CollabServiceStatus, { label: string; color: 'success' | 'warning' | 'error' | 'neutral' }>
> = {
  ok: { label: 'Hoạt động', color: 'success' },
  degraded: { label: 'Suy giảm', color: 'warning' },
  down: { label: 'Không phản hồi', color: 'error' },
  disabled: { label: 'Chưa cấu hình', color: 'neutral' },
};

/** Loại tài nguyên cộng tác (khoá `connections`/`documents` của số liệu và `kinds` của `/health`) → nhãn. */
export const COLLAB_KIND_LABELS: Readonly<Record<string, string>> = {
  document: 'Tài liệu',
  whiteboard: 'Bảng trắng',
};

export const NO_DATA = '—';

/** Tiêu đề hiện thay tên tài liệu PRIVATE — admin không đọc tiêu đề/nội dung tài liệu riêng tư. */
export const PRIVATE_DOCUMENT_LABEL = 'Tài liệu riêng tư';

export const DOCUMENT_STATUS_META = {
  ACTIVE: { label: 'Đang dùng', color: 'success' },
  ARCHIVED: { label: 'Đã lưu trữ', color: 'neutral' },
} as const;
