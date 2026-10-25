/**
 * Câu chữ tiếng Việt riêng của màn "Sửa hồ sơ" (mở từ tab Tôi → `PATHS.ME_EDIT_PROFILE`).
 *
 * ⚠️ Không gộp chung với hằng số của feature khác — `features/me` KHÔNG được import chéo feature
 * (`docs/rules/feature-structure.md`).
 */

/** Trần tên hiển thị — khớp `updateUserSchema.name` của BE (`min(1)`, `max(80)`, đã `trim`). */
export const DISPLAY_NAME_MAX_LENGTH = 80;

export const EDIT_PROFILE_INTRO =
  'Tên hiển thị được thấy trong nhóm, kênh và hội thoại. Ảnh đại diện đổi bằng cách chạm vào ảnh ở màn Tôi.';

export const NAME_REQUIRED_MESSAGE = 'Nhập tên hiển thị.';
export const NAME_TOO_LONG_MESSAGE = `Tên hiển thị tối đa ${String(DISPLAY_NAME_MAX_LENGTH)} ký tự.`;

/** Câu lỗi nói kèm VÍ DỤ đúng dạng — BE chỉ nhận số Việt Nam (di động/bàn) hoặc số quốc tế đầy đủ có `+`/`00`. */
export const PHONE_INVALID_MESSAGE =
  'Số điện thoại không hợp lệ. Ví dụ: 0912 345 678 hoặc +84 912 345 678.';

/**
 * Ghi chú dưới ô SĐT. Nói thẳng SỐ NÀY CHƯA XÁC MINH (chưa có OTP/SMS ở dự án này): người dùng không được tưởng số đã được
 * xác thực. Tra cứu khớp chính xác khi thêm thành viên vào nhóm (`contact-lookup.service` của BE) và tôn trọng cờ riêng tư
 * `findableByPhone`, nên nói "có thể tìm thấy bạn" chứ không hứa chắc.
 */
export const PHONE_HINT =
  'Số tự khai, chưa được xác minh. Người khác có thể tìm thấy bạn bằng số này khi thêm vào nhóm. Để trống nếu muốn xoá số.';

export const EDIT_PROFILE_SAVED_MESSAGE = 'Đã lưu hồ sơ.';
