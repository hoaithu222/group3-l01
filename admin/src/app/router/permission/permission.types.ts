/**
 * Mô hình phân quyền PHẲNG — `{tài nguyên, hành động}`.
 *
 * Cố ý KHÔNG có cấp tổ chức / dự án. Quyền được BE trả về trong `user.permissions`
 * dưới dạng chuỗi `"resource:action"`, so khớp bằng `useAuthStore().hasPermission`.
 *
 * Cần phân quyền theo tổ chức thì dựng ở tầng feature — đừng nhét ngược vào đây,
 * vì mọi màn hình đều đi qua guard này.
 */

/** Hành động chuẩn hoá. Thêm hành động riêng thì mở rộng union tại đây. */
export type PermissionAction = 'view' | 'create' | 'update' | 'delete' | 'export' | 'approve';

export interface PermissionRequirement {
  /** Tên tài nguyên, kebab-case. Vd `'user'`, `'audit-log'`. */
  resource: string;
  /** Mặc định `'view'` khi bỏ trống. */
  action?: PermissionAction;
}

/** Ghép về dạng chuỗi lưu trong `user.permissions`. */
export function permissionKey({ resource, action = 'view' }: PermissionRequirement): string {
  return `${resource}:${action}`;
}
