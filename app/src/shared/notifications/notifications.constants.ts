/**
 * Hằng của lớp đọc/chưa đọc dùng chung (p1-07 `app.md` §4). Số client-only (BE không có khoá tương ứng trong
 * `GET /capabilities`): `readMarkerDebounceMs` được `README` §7 ghi rõ là "[mới, client]".
 */

/** Gom nhiều lần hiển thị tin thành MỘT `POST /read-markers` (NT-03 an toàn nhưng BE giới hạn 120/phút/người). */
export const READ_MARKER_DEBOUNCE_MS = 1000;

/** Sau khi ĐẶT mốc đọc ở máy này: làm mới tóm tắt sau chừng này để lấy số chuẩn của server (patch cục bộ chỉ là tối ưu). */
export const SUMMARY_REFRESH_AFTER_READ_MS = 3000;

/** Sự kiện dồn dập (nhiều tin liên tiếp) gộp thành một lần làm mới. */
export const SUMMARY_INVALIDATE_DEBOUNCE_MS = 1000;
export const INBOX_INVALIDATE_DEBOUNCE_MS = 800;

/** Một tin tới ĐÚNG lúc đang xem cuộc trò chuyện đó thì không đếm chưa đọc — ngưỡng hiển thị badge số. */
export const BADGE_MAX_DISPLAY = 99;

/** Loại luồng → tên room socket (khớp `ROOM_KIND` của `features/chat`). */
export const ROOM_KIND_BY_STREAM = { CHANNEL: 'ch', CONVERSATION: 'conv' } as const;
