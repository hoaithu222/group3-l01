/**
 * Hàm thuần cho phiên đăng nhập — không đụng store, không đụng mạng.
 */
import type { AuthUser } from './types';

/** Vai trò hệ thống được bỏ qua mọi kiểm quyền chi tiết. */
export const SUPER_ROLE = 'admin';

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/**
 * Chuẩn hoá hồ sơ người dùng từ MỌI nguồn không tin được (response BE, giá trị
 * đọc lại từ localStorage) thành đúng `AuthUser`.
 *
 * Vì sao cần: `hasPermission`/`hasRole`/`PermissionGuard` gọi `user.roles.includes`
 * và `user.permissions.includes` — thiếu một trong hai mảng là ném TypeError giữa
 * lúc render, tức MÀN TRẮNG toàn app, mà lỗi này chỉ cần BE quên một trường hoặc
 * một bản lưu cũ trong localStorage. Đồng thời chỉ giữ đúng các trường khai báo
 * ở `AuthUser`: DTO đầy đủ của BE còn `status`, `privacy`… không có lý do nằm
 * trong localStorage.
 *
 * Trả `null` khi không có `id` hợp lệ (không phải hồ sơ người dùng).
 */
export function normalizeAuthUser(raw: unknown): AuthUser | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;

  const roles = asStrings(r.roles);
  // Hợp đồng cũ chỉ có `role` đơn — quy về mảng để `hasRole`/cổng vào không sập.
  if (roles.length === 0 && typeof r.role === 'string' && r.role !== '') roles.push(r.role);

  return {
    id: r.id,
    email: typeof r.email === 'string' ? r.email : '',
    name: typeof r.name === 'string' ? r.name : '',
    avatar: typeof r.avatar === 'string' ? r.avatar : null,
    roles,
    permissions: asStrings(r.permissions),
  };
}

/**
 * Người dùng có được phép VÀO trang quản trị không?
 *
 * Tài khoản `user` thường (đăng ký công khai qua app) đăng nhập được, nhưng BE
 * cấp cho vai đó ZERO quyền quản trị — vào shell chỉ thấy trang trống và mọi lời
 * gọi `/admin/*` trả 403. Chặn từ cổng để họ thấy đúng một câu "không có quyền"
 * thay vì một giao diện rỗng. BE vẫn là chốt chặn thật của từng endpoint; đây chỉ
 * là lớp UX.
 *
 * Được vào khi: là `admin`, hoặc có ít nhất MỘT quyền (vai `manager`, hoặc quyền
 * theo dữ liệu như `recruiter:view` / `partner:view`).
 */
export function hasAdminAccess(user: AuthUser | null): boolean {
  if (!user) return false;
  return user.roles.includes(SUPER_ROLE) || user.permissions.length > 0;
}
