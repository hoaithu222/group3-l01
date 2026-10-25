import { memo, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { PATHS } from '@/app/config/constants';
import type { PermissionRequirement } from './permission.types';

interface PermissionGuardProps {
  requirement?: PermissionRequirement;
  /** Bỏ trống → render `<Outlet/>` (dùng làm route element). */
  children?: ReactNode;
}

/**
 * Chặn route khi thiếu quyền.
 *
 * KHÔNG kiểm đăng nhập — việc đó là của `AuthGuard` nằm ngoài. Ở đây chỉ trả
 * lời đúng một câu: "đã đăng nhập rồi thì có được vào chỗ này không".
 */
const PermissionGuard = memo(function PermissionGuard({
  requirement,
  children,
}: PermissionGuardProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const allowed = !requirement || hasPermission(requirement.resource, requirement.action ?? 'view');

  if (!allowed) return <Navigate replace to={PATHS.FORBIDDEN} />;
  return <>{children ?? <Outlet />}</>;
});

export default PermissionGuard;
