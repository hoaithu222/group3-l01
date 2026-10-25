import { isAxiosError } from 'axios';

/**
 * Nhóm KHÔNG còn truy cập được với người dùng này: 404 (không phải thành viên,
 * hoặc vừa bị loại — BE cố ý trả 404 TRUNG TÍNH cho cả hai, WS-08) hoặc 403.
 * Khác lỗi mạng/5xx: những lỗi đó tạm thời, người dùng phải ở lại để thử lại,
 * ⛔ không được bị đá ra khỏi nhóm chỉ vì mất sóng một nhịp.
 */
export function isWorkspaceGone(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 404 || status === 403;
}
