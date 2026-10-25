/**
 * Ngữ nghĩa "vai trò phủ vai trò" của p3-04 (README §2 "Ngữ nghĩa roleRef") — DÙNG CHUNG bởi grant kênh theo vai
 * trò (`modules/channels`) và `@role` (`modules/mentions`), nên nằm ở `core/` (module không import chéo nhau):
 *
 *   `ADMIN`  = OWNER + ADMIN
 *   `MEMBER` = OWNER + ADMIN + MEMBER          (KHÔNG bao giờ gồm GUEST)
 *
 * Vai trò cao bao gồm thấp; khách không bao giờ nhận quyền/thông báo qua vai trò.
 */
export const GRANT_ROLE_REFS = ["ADMIN", "MEMBER"] as const;
export type GrantRoleRef = (typeof GRANT_ROLE_REFS)[number];

/** Vai trò workspace nằm dưới một `roleRef` (không gồm GUEST). */
export type CoveredWorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

const COVERED_BY_REF: Record<GrantRoleRef, readonly CoveredWorkspaceRole[]> = {
  ADMIN: ["OWNER", "ADMIN"],
  MEMBER: ["OWNER", "ADMIN", "MEMBER"],
};

const COVERING_BY_ROLE: Record<CoveredWorkspaceRole, readonly GrantRoleRef[]> = {
  OWNER: ["ADMIN", "MEMBER"],
  ADMIN: ["ADMIN", "MEMBER"],
  MEMBER: ["MEMBER"],
};

export function isGrantRoleRef(value: unknown): value is GrantRoleRef {
  return typeof value === "string" && (GRANT_ROLE_REFS as readonly string[]).includes(value);
}

/** `ChannelGrant.subjectKey` của một grant theo vai trò: `"role:ADMIN"` | `"role:MEMBER"`. */
export function roleSubjectKey(roleRef: GrantRoleRef): string {
  return `role:${roleRef}`;
}

/** Các `roleRef` PHỦ TỚI người có vai trò workspace `role` (`GUEST`/khác/`null` → rỗng). */
export function rolesCovering(role: string | null | undefined): readonly GrantRoleRef[] {
  return role && Object.prototype.hasOwnProperty.call(COVERING_BY_ROLE, role)
    ? COVERING_BY_ROLE[role as CoveredWorkspaceRole]
    : [];
}

/** Các vai trò workspace mà `roleRef` phủ tới (dùng để tìm người nhận theo vai trò). */
export function workspaceRolesCoveredBy(roleRef: GrantRoleRef): readonly CoveredWorkspaceRole[] {
  return COVERED_BY_REF[roleRef];
}

/** Hợp các vai trò workspace được phủ bởi nhiều `roleRef` (bỏ trùng). */
export function workspaceRolesCoveredByAny(roleRefs: Iterable<GrantRoleRef>): CoveredWorkspaceRole[] {
  const out = new Set<CoveredWorkspaceRole>();
  for (const ref of roleRefs) for (const role of COVERED_BY_REF[ref]) out.add(role);
  return [...out];
}

/** Người có vai trò workspace `role` có được phủ bởi ít nhất một `roleRef` trong `roleRefs` không. */
export function isCoveredByAnyRole(role: string | null | undefined, roleRefs: Iterable<string>): boolean {
  const covering = rolesCovering(role);
  if (covering.length === 0) return false;
  for (const ref of roleRefs) if ((covering as readonly string[]).includes(ref)) return true;
  return false;
}

/** Nhãn tiếng Việt của `roleRef` (snapshot vào `mentions[].label` và hiển thị "Được cấp qua vai trò"). */
export const ROLE_REF_LABEL: Record<GrantRoleRef, string> = {
  ADMIN: "Quản trị viên",
  MEMBER: "Thành viên",
};
