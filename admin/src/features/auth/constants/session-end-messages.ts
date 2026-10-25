import type { SessionEndReason } from '@/app/store';

/**
 * Lời nhắn ở trang đăng nhập khi phiên kết thúc KHÔNG phải do người dùng bấm đăng xuất.
 * (`null` — tự thoát — không có lời nhắn.)
 */
export const SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  expired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.',
  revoked:
    'Phiên đăng nhập đã bị thu hồi (đổi mật khẩu, đăng nhập tài khoản khác hoặc nghi ngờ bất thường). Vui lòng đăng nhập lại.',
  locked: 'Tài khoản đã bị khoá hoặc đang chờ xoá. Liên hệ quản trị viên để được hỗ trợ.',
};
