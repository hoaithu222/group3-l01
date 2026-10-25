import { ROLES, type RoleCode } from "./roles";

export const PERMISSION_ACTIONS = [
  "view",
  "create",
  "update",
  "delete",
  "export",
  "approve",
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** resource = id phân hệ trong Module Registry của admin */
export const ADMIN_RESOURCES = [
  "dashboard",
  "user",
  "workspace",
  "moderation",
  "audit-log",
  "system-config",
  "gamification",
  "ai-job",
  "integration",
  "skill",
  "recruiter",
  "o2o",
  "partner",
  /** (p2-07) Vận hành gọi & họp toàn nền tảng: view (bảng/health/thống kê), update (force-end), export (CSV P1), delete (xoá bản ghi hình). */
  "meeting",
  /** (p4-07) Lộ trình học: view, create (môn/tháng/buổi mới), update (sửa nội dung/ảnh/sắp xếp/xuất bản), delete (xoá mềm). */
  "roadmap",
] as const;
export type AdminResource = (typeof ADMIN_RESOURCES)[number];
export type PermissionKey = `${AdminResource}:${PermissionAction}`;

export function permissionKey(resource: AdminResource, action: PermissionAction): PermissionKey {
  return `${resource}:${action}`;
}
const every = (resource: AdminResource): PermissionKey[] =>
  PERMISSION_ACTIONS.map((a) => permissionKey(resource, a));

/**
 * Quyền theo system role. `recruiter:*` và `partner:*` KHÔNG ở đây — gắn theo
 * dữ liệu (CompanyMember/PrintShop) trong AuthUserDto (Phase 5).
 */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionKey[]> = {
  [ROLES.ADMIN]: ADMIN_RESOURCES.filter((r) => r !== "partner").flatMap(every),
  [ROLES.MANAGER]: [
    "dashboard:view",
    "user:view",
    "workspace:view",
    "workspace:update",
    "moderation:view",
    "moderation:update",
    "moderation:approve",
    "audit-log:view",
    "system-config:view",
    "gamification:view",
    "gamification:update",
    "ai-job:view",
    "integration:view",
    "skill:view",
    "skill:update",
    "recruiter:view",
    "recruiter:approve",
    "o2o:view",
    "o2o:create",
    "o2o:update",
    // (p2-07) manager xem + kết thúc cưỡng bức + xuất CSV; KHÔNG `meeting:delete` (xoá bản ghi hình không hoàn tác được — chỉ admin).
    "meeting:view",
    "meeting:update",
    "meeting:export",
    "roadmap:view",
    "roadmap:update",
  ],
  [ROLES.USER]: [],
};

export function permissionsForRole(role: string | undefined): PermissionKey[] {
  if (!role) return [];
  const list = (ROLE_PERMISSIONS as Record<string, readonly PermissionKey[] | undefined>)[role];
  return list ? [...list] : [];
}

/** Kiểm tra role hệ thống có quyền `key` không (không tính quyền theo dữ liệu). */
export const roleHasPermission = (role: string | undefined, key: PermissionKey): boolean =>
  permissionsForRole(role).includes(key);

export function isPermissionKey(value: string): value is PermissionKey {
  const [r, a] = value.split(":");
  return (
    (ADMIN_RESOURCES as readonly string[]).includes(r ?? "") &&
    (PERMISSION_ACTIONS as readonly string[]).includes(a ?? "")
  );
}
