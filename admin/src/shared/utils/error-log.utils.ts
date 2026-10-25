/**
 * @file error-log.utils.ts
 * @description Rút gọn lỗi trước khi ghi ra console.
 *
 * ⛔ Đừng `console.error('…', err)` với lỗi HTTP của axios. Đối tượng `AxiosError` mang
 * cả `config` của request: `config.data` là body đã serialize (`{"password":"…"}` của
 * đăng nhập/đổi mật khẩu) và `config.headers.Authorization` là access token. DevTools
 * in trọn vẹn — thứ dễ lọt vào ảnh chụp màn hình, screen-share, báo cáo lỗi
 * (`docs/rules/test-viewpoint.md §6`).
 *
 * `Form` / `FormModal` bắt lỗi ném ra từ `onSubmit` rồi ghi log, mà `onSubmit` của form
 * đăng nhập chính là lời gọi API mang mật khẩu — nên hai nơi đó bắt buộc đi qua đây.
 */
import { isAxiosError } from 'axios';

/** Lỗi axios → chỉ những trường vô hại; mọi lỗi khác trả nguyên (stack của `Error` không chứa bí mật). */
export function toSafeLog(error: unknown): unknown {
  if (!isAxiosError(error)) return error;
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    status: error.response?.status,
    method: error.config?.method,
    url: error.config?.url,
  };
}
