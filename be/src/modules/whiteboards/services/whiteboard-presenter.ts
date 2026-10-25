import type { ResolvedAccess } from "../../../core/permission";
import type { CollaboratorEntity, MyRole, PersonRef, WhiteboardDetailView, WhiteboardEntity, WhiteboardView } from "../entities/whiteboard.interface";

/**
 * `myRole` hiển thị cho client (server tính, client không tự suy — 02-conventions §2): người tạo → CREATOR; có dòng cộng tác → EDITOR/VIEWER;
 * còn lại (thành viên nhóm, bảng WORKSPACE) → MEMBER.
 */
export function myRoleOf(userId: string, board: Pick<WhiteboardEntity, "createdBy">, collaborator: Pick<CollaboratorEntity, "role"> | null): MyRole {
  if (board.createdBy === userId) return "CREATOR";
  if (collaborator) return collaborator.role;
  return "MEMBER";
}

export function toWhiteboardView(
  board: WhiteboardEntity,
  myRole: MyRole,
  people: ReadonlyMap<string, PersonRef>,
  thumbnails: ReadonlyMap<string, string> = new Map()
): WhiteboardView {
  return {
    id: board.id,
    workspaceId: board.workspaceId,
    name: board.name,
    visibility: board.visibility,
    status: board.status,
    elementCount: board.elementCount,
    thumbnailAssetId: board.thumbnailAssetId,
    thumbnailUrl: board.thumbnailAssetId ? (thumbnails.get(board.thumbnailAssetId) ?? null) : null,
    lastEditedBy: board.lastEditedBy ? (people.get(board.lastEditedBy) ?? { id: board.lastEditedBy, name: "Người dùng" }) : null,
    lastEditedAt: board.lastEditedAt,
    createdBy: board.createdBy,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    version: board.version,
    yjsVersion: board.yjsVersion,
    myRole,
  };
}

/** `myPermissions` = 4 cờ do SERVER tính từ `ResolvedAccess` (không trả `yjsState`). */
export function toWhiteboardDetailView(
  board: WhiteboardEntity,
  myRole: MyRole,
  people: ReadonlyMap<string, PersonRef>,
  access: ResolvedAccess,
  thumbnails: ReadonlyMap<string, string> = new Map()
): WhiteboardDetailView {
  return {
    ...toWhiteboardView(board, myRole, people, thumbnails),
    myPermissions: {
      edit: access.actions.has("whiteboard.edit"),
      manage: access.actions.has("whiteboard.manage"),
      snapshot: access.actions.has("whiteboard.snapshot"),
      restore: access.actions.has("whiteboard.restore"),
    },
  };
}
