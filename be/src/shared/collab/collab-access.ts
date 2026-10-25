/**
 * Ma trận quyền DÙNG CHUNG cho mọi tài nguyên cộng tác (tài liệu p6-01, bảng trắng p6-02) — hàm THUẦN, không I/O, để test cả bảng
 * (vai × visibility × trạng thái) và để mỗi module chỉ ánh xạ `CollabAbility` → `Action` riêng của mình (`document.*`, `whiteboard.*`).
 *
 *   read      xem + nhận cập nhật realtime
 *   edit      sửa nội dung (kết nối collab chế độ `edit`)
 *   manage    đổi tên/visibility, mời/gỡ người cộng tác, lưu trữ/khôi phục tài nguyên
 *   snapshot  tạo bản lưu thủ công
 *   restore   khôi phục bản lưu
 *
 * Quy tắc (README p6-01 §6):
 *  - Người không phải thành viên ACTIVE của workspace → `null` (404 trung tính).
 *  - WORKSPACE: MEMBER+ đọc + sửa; quản lý = người tạo hoặc OWNER/ADMIN. GUEST chỉ vào được khi là cộng tác viên (EDITOR sửa, VIEWER đọc).
 *  - PRIVATE: CHỈ người tạo + cộng tác viên (OWNER/ADMIN workspace KHÔNG tự đọc — nguyên tắc kênh riêng tư). Người tạo quản lý (trừ khi đã hạ xuống GUEST).
 *  - Tài nguyên ARCHIVED: chỉ đọc (+ `manage` để khôi phục lưu trữ); workspace ARCHIVED: chỉ đọc, không quản lý.
 */
export type CollabAbility = "read" | "edit" | "manage" | "snapshot" | "restore";
export type CollabVisibility = "WORKSPACE" | "PRIVATE";
export type CollabWorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
export type CollabCollaboratorRole = "EDITOR" | "VIEWER";

export interface CollabAccessInput {
  userId: string;
  visibility: CollabVisibility;
  resourceStatus: "ACTIVE" | "ARCHIVED";
  createdBy: string;
  collaboratorRole: CollabCollaboratorRole | null;
  /** `null` = không phải thành viên ACTIVE (đã rời/bị xoá/khách hết hạn/chưa vào). */
  workspaceRole: CollabWorkspaceRole | null;
  workspaceActive: boolean;
}

export function resolveCollabAbilities(input: CollabAccessInput): Set<CollabAbility> | null {
  const { userId, visibility, resourceStatus, createdBy, collaboratorRole, workspaceRole, workspaceActive } = input;
  if (!workspaceRole) return null;

  const isCreator = createdBy === userId;
  const isGuest = workspaceRole === "GUEST";
  const isWorkspaceAdmin = workspaceRole === "OWNER" || workspaceRole === "ADMIN";

  let canEdit = false;
  let canManage = false;
  if (visibility === "WORKSPACE") {
    if (!isGuest) {
      canEdit = true;
      canManage = isCreator || isWorkspaceAdmin;
    } else {
      if (!collaboratorRole && !isCreator) return null;
      canEdit = collaboratorRole === "EDITOR";
    }
  } else if (isCreator) {
    canEdit = true;
    canManage = !isGuest;
  } else if (collaboratorRole) {
    canEdit = collaboratorRole === "EDITOR";
  } else {
    return null;
  }

  const abilities = new Set<CollabAbility>(["read"]);
  if (canEdit && workspaceActive && resourceStatus === "ACTIVE") {
    abilities.add("edit");
    abilities.add("snapshot");
    abilities.add("restore");
  }
  if (canManage && workspaceActive) abilities.add("manage");
  return abilities;
}

/** Chế độ kết nối collab suy từ khả năng: có `edit` → `edit`, còn lại `view`. */
export function collabModeOf(abilities: ReadonlySet<CollabAbility>): "edit" | "view" {
  return abilities.has("edit") ? "edit" : "view";
}
