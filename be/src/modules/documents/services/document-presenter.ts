import type { ResolvedAccess } from "../../../core/permission";
import type { DocumentDetailView, DocumentEntity, DocumentView, MyRole, PersonRef, CollaboratorEntity } from "../entities/document.interface";

/**
 * `myRole` hiển thị cho client (server tính, client không tự suy — 02-conventions §2): người tạo → CREATOR; có dòng cộng tác → EDITOR/VIEWER;
 * còn lại (thành viên nhóm, tài liệu WORKSPACE) → MEMBER.
 */
export function myRoleOf(userId: string, doc: Pick<DocumentEntity, "createdBy">, collaborator: Pick<CollaboratorEntity, "role"> | null): MyRole {
  if (doc.createdBy === userId) return "CREATOR";
  if (collaborator) return collaborator.role;
  return "MEMBER";
}

export function toDocumentView(doc: DocumentEntity, myRole: MyRole, people: ReadonlyMap<string, PersonRef>): DocumentView {
  return {
    id: doc.id,
    workspaceId: doc.workspaceId,
    title: doc.title,
    visibility: doc.visibility,
    status: doc.status,
    wordCount: doc.wordCount,
    lastEditedBy: doc.lastEditedBy ? (people.get(doc.lastEditedBy) ?? { id: doc.lastEditedBy, name: "Người dùng" }) : null,
    lastEditedAt: doc.lastEditedAt,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    version: doc.version,
    yjsVersion: doc.yjsVersion,
    myRole,
  };
}

/** `myPermissions` = 4 cờ do SERVER tính từ `ResolvedAccess` (không trả `yjsState`). */
export function toDocumentDetailView(doc: DocumentEntity, myRole: MyRole, people: ReadonlyMap<string, PersonRef>, access: ResolvedAccess): DocumentDetailView {
  return {
    ...toDocumentView(doc, myRole, people),
    myPermissions: {
      edit: access.actions.has("document.edit"),
      manage: access.actions.has("document.manage"),
      snapshot: access.actions.has("document.snapshot"),
      restore: access.actions.has("document.restore"),
    },
  };
}
