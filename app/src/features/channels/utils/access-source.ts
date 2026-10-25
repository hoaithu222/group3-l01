import type { RoleRef } from '../api';

/** Tên vai trò hiển thị — `MEMBER` là "Toàn bộ thành viên" vì role grant `MEMBER` phủ CẢ chủ nhóm + quản trị viên + thành viên. */
export const ROLE_REF_LABEL: Record<RoleRef, string> = {
  ADMIN: 'Quản trị viên',
  MEMBER: 'Toàn bộ thành viên',
};

const ROLE_PREFIX = 'ROLE:';

/** `effectiveSources` có nguồn `ROLE:*` không (PR-05: gỡ trực tiếp mà còn ROLE thì người đó VẪN đọc được). */
export function hasRoleSource(sources: readonly string[]): boolean {
  return sources.some((source) => source.startsWith(ROLE_PREFIX));
}

function roleLabel(source: string): string {
  const roleRef = source.slice(ROLE_PREFIX.length);
  return roleRef in ROLE_REF_LABEL ? ROLE_REF_LABEL[roleRef as RoleRef] : roleRef;
}

/**
 * "Được cấp trực tiếp" · "Được cấp qua vai trò Quản trị viên" · "… trực tiếp và qua vai trò …"
 * từ `effectiveSources` (`'DIRECT'`, `'ROLE:ADMIN'`, …). Rỗng → chuỗi rỗng (nơi gọi ẩn dòng).
 * Nguồn ROLE mà không rõ vai trò nào (BE cũ) → "qua vai trò" trơn, không để trống chỗ tên.
 */
export function describeAccessSources(sources: readonly string[]): string {
  const roleSources = sources.filter((source) => source.startsWith(ROLE_PREFIX));
  const roleNames = roleSources.map(roleLabel).filter((name) => name.length > 0);
  const direct = sources.includes('DIRECT');

  const viaRole = roleNames.length > 0 ? `qua vai trò ${roleNames.join(', ')}` : 'qua vai trò';
  if (roleSources.length > 0 && direct) return `Được cấp trực tiếp và ${viaRole}`;
  if (roleSources.length > 0) return `Được cấp ${viaRole}`;
  return direct ? 'Được cấp trực tiếp' : '';
}
