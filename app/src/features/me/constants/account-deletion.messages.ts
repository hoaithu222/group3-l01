/**
 * Câu chữ tiếng Việt riêng của màn "Xoá tài khoản (ân hạn)" (p0-01 mục 10, mở từ `me/settings`).
 *
 * ⚠️ Không gộp chung với hằng số của `features/auth` — `features/me` KHÔNG được import chéo feature
 * (`docs/rules/feature-structure.md`).
 *
 * ⛔ Câu chữ phải khớp HÀNH VI THẬT của BE: yêu cầu xoá thu hồi MỌI phiên ngay (kể cả máy này), nên
 * KHÔNG được hứa "vẫn dùng ứng dụng bình thường trong lúc chờ" như bản cũ.
 */

/** Cảnh báo hậu quả — hiện TRƯỚC ô mật khẩu. */
export const DELETE_ACCOUNT_WARNING =
  'Sau khi gửi yêu cầu, bạn sẽ bị đăng xuất khỏi mọi thiết bị. Trong thời gian ân hạn, hãy đăng nhập lại để huỷ yêu cầu và dùng lại tài khoản. Hết thời gian ân hạn, tài khoản bị ẩn danh hoá vĩnh viễn.';

export const DELETE_ACCOUNT_CONFIRM_DIALOG_TITLE = 'Yêu cầu xoá tài khoản?';

export const DELETE_ACCOUNT_CONFIRM_DIALOG_DESCRIPTION =
  'Bạn sẽ bị đăng xuất khỏi mọi thiết bị và tài khoản chuyển sang trạng thái chờ xoá. Bạn có thể huỷ yêu cầu trong thời gian ân hạn.';

/** `USER_010`: BE chặn xoá khi người dùng còn là chủ nhóm — thông điệp đã nêu việc cần làm, đây là lối tới nhóm. */
export const DELETE_ACCOUNT_OPEN_WORKSPACES = 'Xem danh sách nhóm';
