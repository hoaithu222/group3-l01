import type { PersonRef } from "../entities/document.interface";

export type WorkspaceRoleValue = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export interface DirectoryUser extends PersonRef {
  status: string;
  sessionVersion: number;
}

/**
 * Đọc dữ kiện nền của module khác (workspace/thành viên/người dùng) qua MỘT cổng nhỏ — `documents` không import module đó
 * (luật 3 tầng). Quyền vẫn do `PermissionService` quyết; cổng này chỉ trả dữ kiện (trạng thái nhóm, danh sách thành viên, tên).
 */
export interface IDocumentDirectory {
  /** `null` = workspace không tồn tại. */
  workspaceStatus(workspaceId: string): Promise<string | null>;
  workspaceNames(ids: string[]): Promise<Map<string, string>>;
  /** Id thành viên ACTIVE có vai MEMBER trở lên (không tính khách) — khán giả của sự kiện tài liệu WORKSPACE. */
  activeMemberIds(workspaceId: string): Promise<string[]>;
  /** Vai trò ACTIVE (khách còn hạn) của các user trong workspace; user không phải thành viên bị bỏ khỏi Map. */
  activeRoles(workspaceId: string, userIds: string[]): Promise<Map<string, WorkspaceRoleValue>>;
  users(ids: string[]): Promise<Map<string, PersonRef>>;
  user(id: string): Promise<DirectoryUser | null>;
}
