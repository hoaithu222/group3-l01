import type { WorkspaceRoleValue } from "../entities/member.interface";

/** Bậc vai trò workspace (be.md p1-02 §5.4/§5.5) — OWNER > ADMIN > MEMBER > GUEST. */
const RANK: Record<WorkspaceRoleValue, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1, GUEST: 0 };

export function rankOf(role: WorkspaceRoleValue): number {
  return RANK[role];
}

/** Actor thao tác lên target hợp lệ khi bậc actor CAO HƠN bậc target (không ngang/thấp hơn). */
export function outranks(actorRole: WorkspaceRoleValue, targetRole: WorkspaceRoleValue): boolean {
  return rankOf(actorRole) > rankOf(targetRole);
}
