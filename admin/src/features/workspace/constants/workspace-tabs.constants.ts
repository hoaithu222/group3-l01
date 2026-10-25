/** Đường về danh bạ khi route không khai `handle.modulePath` (mở trực tiếp trang chi tiết). */
export const FALLBACK_LIST_PATH = '/workspace';

/** Các tab luôn có của trang chi tiết workspace. */
export const TABS = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'members', label: 'Thành viên' },
  { key: 'channels', label: 'Kênh' },
  { key: 'conversations', label: 'Nhóm chat' },
  { key: 'reports', label: 'Báo cáo' },
];

/** Tab p2-04 — chỉ thêm vào danh sách khi cờ `meeting` bật VÀ có `workspace:view`; chỉ metadata, xếp sau các tab hiện có. */
export const MEETING_TAB = { key: 'meetings', label: 'Cuộc họp' };

/**
 * Tab p2-06 — cờ `meeting` bật VÀ `meeting:view` (BE chặn `/admin/recordings*` bằng quyền này, cùng `MEDIA_TAB`; tab Cuộc họp mới là `workspace:view`); chỉ metadata
 * vận hành, đứng ngay sau tab Cuộc họp.
 */
export const RECORDING_TAB = { key: 'recordings', label: 'Ghi hình' };

/**
 * Tab p2-07 (số liệu gọi & họp của workspace) — chỉ thêm vào danh sách khi cờ `meeting` bật VÀ có `meeting:view` (BE chặn `media-stats` bằng quyền
 * này, không phải `workspace:view`); đứng ngay sau tab Ghi hình. Chỉ SỐ LIỆU, không danh sách người/cuộc gọi.
 */
export const MEDIA_TAB = { key: 'media', label: 'Cuộc gọi & họp' };

/** Tab p6-04 — chỉ thêm vào danh sách khi cờ `wallet` bật VÀ có `workspace:view`. */
export const WALLET_TAB = { key: 'wallet', label: 'Ví (thống kê)' };

/**
 * Tab p3-01 (Tài liệu) và p3-02 (Dự án) — chỉ SỐ LIỆU, chỉ thêm vào danh sách khi cờ `project` bật
 * VÀ có `workspace:view`. Xếp sau các tab hiện có, trước tab ví.
 */
export const PROJECT_TABS = [
  { key: 'resources', label: 'Tài liệu' },
  { key: 'projects', label: 'Dự án' },
];

/** Tab p5-03 (chỉ đọc kết nối tích hợp) — chỉ thêm vào danh sách khi cờ `integration` bật VÀ có `integration:view`. */
export const INTEGRATIONS_TAB = { key: 'integrations', label: 'Tích hợp' };

/** Tab p6-03 (bài + đợt cố vấn của nhóm) — chỉ thêm vào danh sách khi cờ `mentor` bật VÀ có `workspace:view`. */
export const MENTOR_TAB = { key: 'mentor', label: 'Cố vấn' };

/** Tab của module khác — chưa tới lượt, xem `docs/plans/README.md` đồng bộ chéo. */
export const COMING_SOON: Record<string, string> = {};
