import { registerScopeResolver } from "../../../core/permission";
import type { Action, ResolvedAccess, ScopeRef } from "../../../core/permission";
import { resolveCollabAbilities, type CollabAbility, type CollabWorkspaceRole } from "../../../shared/collab";
import type { ICollaboratorRepository } from "../repositories/collaborator.repository.interface";
import type { IDocumentDirectory } from "../repositories/document-directory.interface";
import type { IDocumentRepository } from "../repositories/document.repository.interface";

/** `CollabAbility` (dùng chung tài liệu/bảng trắng) → `Action` của scope DOCUMENT. */
export const ACTION_OF_ABILITY: Record<CollabAbility, Action> = {
  read: "document.read",
  edit: "document.edit",
  manage: "document.manage",
  snapshot: "document.snapshot",
  restore: "document.restore",
};

const INVISIBLE: ResolvedAccess = { visible: false, role: null, actions: new Set() };

export interface DocumentAccessDeps {
  documents: Pick<IDocumentRepository, "findById">;
  collaborators: Pick<ICollaboratorRepository, "find">;
  directory: Pick<IDocumentDirectory, "workspaceStatus">;
}

/**
 * Resolver scope `DOCUMENT` (p6-01 be.md §5 `DocumentAccessService.resolve`): uỷ quyền WORKSPACE cha bằng `ctx.resolve` (kiểm thành viên ACTIVE,
 * khách hết hạn…) rồi áp ma trận thuần `resolveCollabAbilities` (WORKSPACE/PRIVATE × vai × ACTIVE/ARCHIVED). Trả lại `role` của cha để
 * `assert` xử lý khách; `versionDeps: [WORKSPACE]` nên đổi thành viên/thu hồi quyền ở nhóm tự vô hiệu cache tài liệu mà không cần bump từng cái.
 * Đổi cộng tác viên/visibility/lưu trữ tài liệu → service gọi `permissionService.bumpVersion({ type: "DOCUMENT", id })`.
 */
export function registerDocumentScopeResolver(deps: DocumentAccessDeps): void {
  registerScopeResolver({
    type: "DOCUMENT",
    async resolve(user, documentId, ctx): Promise<ResolvedAccess> {
      const doc = await deps.documents.findById(documentId);
      if (!doc) return INVISIBLE;
      const parent: ScopeRef = { type: "WORKSPACE", id: doc.workspaceId };
      const [ws, collaborator, workspaceStatus] = await Promise.all([
        ctx.resolve(user, parent),
        deps.collaborators.find(documentId, user.id),
        deps.directory.workspaceStatus(doc.workspaceId),
      ]);
      if (!ws.visible) return INVISIBLE;

      const abilities = resolveCollabAbilities({
        userId: user.id,
        visibility: doc.visibility,
        resourceStatus: doc.status,
        createdBy: doc.createdBy,
        collaboratorRole: collaborator?.role ?? null,
        workspaceRole: ws.role as CollabWorkspaceRole | null,
        workspaceActive: workspaceStatus === "ACTIVE",
      });
      if (!abilities) return INVISIBLE;

      return {
        visible: true,
        role: ws.role,
        actions: new Set<Action>([...abilities].map((a) => ACTION_OF_ABILITY[a])),
        parent,
        versionDeps: [parent],
        ...(ws.expiresAt ? { expiresAt: ws.expiresAt } : {}),
      };
    },
  });
}
