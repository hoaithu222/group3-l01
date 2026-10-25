/** Mã role dùng trong JWT và requireRoles(). */
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MANAGER: "manager",
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LIST: RoleCode[] = [ROLES.ADMIN, ROLES.USER, ROLES.MANAGER];
