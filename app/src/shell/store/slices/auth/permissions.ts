import type { AuthUser } from './types';

/**
 * Vai trò được bỏ qua mọi kiểm tra quyền chi tiết.
 *
 * ⛔ Khai ĐÚNG MỘT chỗ. Trước đây hằng này nằm trong `auth.store.ts` còn thanh
 * tab tự lọc riêng — hai bộ luật song song, và chỉ cần một bên quên nhánh
 * `admin` là quản trị viên nhìn thấy tab nhưng bấm vào thì bị chặn (hoặc ngược
 * lại). Loại lệch đó không ai báo vì trông chỉ "hơi lạ".
 */
export const SUPER_ROLE = 'admin';

/**
 * Người dùng có quyền `resource:action` hay không.
 *
 * Hàm THUẦN, không đụng store — nhờ vậy dùng được ở cả ba nơi cần: trong
 * `auth.store` (qua `get()`), trong hook lọc phân hệ (từ `user` đã lấy ra), và
 * trong test (truyền thẳng một object `AuthUser` giả).
 *
 * ⚠️ Đây là kiểm tra để HIỂN THỊ. Hàng rào thật nằm ở backend — nó phải từ chối
 * mọi request không đủ quyền, bất kể client vẽ gì ra màn hình.
 */
export function userHasPermission(
  user: AuthUser | null,
  resource: string,
  action: string,
): boolean {
  if (!user) return false;
  if (user.roles.includes(SUPER_ROLE)) return true;
  return user.permissions.includes(`${resource}:${action}`);
}
