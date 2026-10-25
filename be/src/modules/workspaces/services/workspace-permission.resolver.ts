import { registerScopeResolver, type ResolvedAccess } from "../../../core/permission";
import type { Action } from "../../../core/permission";
import { ROOM } from "../../../infrastructure/socket";
import type { IWorkspaceRepository } from "../repositories/workspace.repository.interface";
import type { WorkspaceRoleValue, WorkspaceStatusValue } from "../entities/workspace.interface";

export const READ_ONLY_ACTIONS: Action[] = ["workspace.read", "workspace.member.list"];

// ── Phase 3 (foundation) — hành động của kho tài liệu / dự án / khách; bảng vai↔action chốt theo README các module
// p3-01 §6, p3-02 §6, p3-03 §6, p3-04 §6. GUEST KHÔNG có action nào ở đây (→ 404 nhờ `GUEST_HIDDEN_ACTIONS`).
/** MEMBER trở lên. */
const PHASE3_MEMBER_ACTIONS: Action[] = [
  "workspace.resource.read",
  "workspace.resource.upload",
  "workspace.folder.manage",
  "workspace.board.read",
  "workspace.task.create",
  "workspace.task.update",
  "workspace.task.status",
  "workspace.task.comment",
];
/** ADMIN trở lên. */
const PHASE3_ADMIN_ACTIONS: Action[] = [
  "workspace.resource.delete",
  "workspace.board.create",
  "workspace.board.edit",
  "workspace.task.delete",
  "workspace.guest.manage",
  "workspace.join-request.decide",
  "workspace.mention.role",
];
/** Chỉ OWNER (`joinPolicy`, `guestPolicy`). */
const PHASE3_OWNER_ACTIONS: Action[] = ["workspace.policy.update"];
/** Workspace ARCHIVED: chỉ xem/tải — giữ lại các action ĐỌC của Phase 3 nếu vai trò đó có. */
const PHASE3_READ_ONLY_ACTIONS: Action[] = ["workspace.resource.read", "workspace.board.read"];

/**
 * Tập action theo bậc vai trò — chỉ phần README §6 đã chốt (view/edit/archive/
 * transfer/leave/personal) là chắc chắn; phần `member.*`/`*.create` suy theo
 * thứ bậc OWNER > ADMIN > MEMBER > GUEST hợp lý, p1-02/p1-03/p1-05/p2-04 tinh
 * chỉnh lại khi tới lượt implement (thêm dòng đồng bộ chéo ở
 * `docs/plans/README.md` nếu khác, KHÔNG sửa âm thầm ở module khác).
 */
export const ACTIONS_BY_ROLE: Record<WorkspaceRoleValue, Action[]> = {
  GUEST: ["workspace.read"],
  MEMBER: ["workspace.read", "workspace.member.list", ...PHASE3_MEMBER_ACTIONS],
  ADMIN: [
    "workspace.read",
    "workspace.update",
    "workspace.member.list",
    "workspace.member.invite",
    "workspace.member.remove",
    "workspace.member.role",
    "workspace.channel.create",
    "workspace.conversation.create",
    "workspace.meeting.create",
    ...PHASE3_MEMBER_ACTIONS,
    ...PHASE3_ADMIN_ACTIONS,
  ],
  OWNER: [
    "workspace.read",
    "workspace.update",
    "workspace.archive",
    "workspace.transfer",
    "workspace.member.list",
    "workspace.member.invite",
    "workspace.member.remove",
    "workspace.member.ban",
    "workspace.member.role",
    "workspace.channel.create",
    "workspace.conversation.create",
    "workspace.meeting.create",
    ...PHASE3_MEMBER_ACTIONS,
    ...PHASE3_ADMIN_ACTIONS,
    ...PHASE3_OWNER_ACTIONS,
  ],
};

/** Dùng lại bởi `workspace.service.ts` ngay sau `create()` (OWNER trên workspace vừa tạo — khỏi round-trip qua cache quyền). */
export function computeWorkspaceActions(role: WorkspaceRoleValue, workspaceStatus: WorkspaceStatusValue): Set<Action> {
  if (workspaceStatus !== "ARCHIVED") return new Set(ACTIONS_BY_ROLE[role]);
  const ofRole = ACTIONS_BY_ROLE[role];
  return new Set([...READ_ONLY_ACTIONS, ...PHASE3_READ_ONLY_ACTIONS.filter((a) => ofRole.includes(a))]);
}

/**
 * Đăng ký resolver `WORKSPACE` cho `PermissionService` (be.md §5.8). Gọi 1
 * lần lúc wiring DI trong `workspaces.routes.ts` (cần `repo` cụ thể) — khác
 * `registerScopeResolver` các module Phase 0 side-effect thuần import vì
 * resolver này cần instance repository đã tạo.
 */
export function registerWorkspacePermissionResolver(repo: IWorkspaceRepository): void {
  registerScopeResolver({
    type: "WORKSPACE",
    async resolve(user, scopeId, ctx): Promise<ResolvedAccess> {
      const found = await repo.findMembershipWithWorkspace(user.id, scopeId);
      // PENDING (chờ duyệt), LEFT/REMOVED/BANNED: không phải thành viên → 404 trung tính với mọi nội dung.
      if (!found || found.membership.status !== "ACTIVE") {
        return { visible: false, role: null, actions: new Set() };
      }
      const { workspace, membership } = found;
      // p3-04 §5.1 — khách quá hạn coi như KHÔNG phải thành viên ngay (không chờ job `guest.expire`).
      const guestExpiresAt = membership.role === "GUEST" ? membership.expiresAt : null;
      if (guestExpiresAt && guestExpiresAt <= ctx.now) {
        return { visible: false, role: null, actions: new Set() };
      }
      // ARCHIVED → mọi action ghi bị chặn ngay sau commit (README §2 "Archive
      // ảnh hưởng module khác"); chỉ còn hành động đọc.
      return {
        visible: true,
        role: membership.role,
        actions: computeWorkspaceActions(membership.role, workspace.status),
        // Cache quyền tự vô hiệu đúng lúc khách hết hạn (`ResolvedAccess.expiresAt`).
        ...(guestExpiresAt && { expiresAt: guestExpiresAt }),
      };
    },
    roomsFor(scopeId) {
      return [ROOM.workspace(scopeId)];
    },
  });
}
