import type { PersonRef } from "../entities/whiteboard.interface";
import type { DirectoryUser, IWhiteboardDirectory, WorkspaceRoleValue } from "./whiteboard-directory.interface";

/** Cài đặt in-memory cho test: nạp workspace/thành viên/người dùng bằng tay. */
export class InMemoryWhiteboardDirectory implements IWhiteboardDirectory {
  readonly workspaces = new Map<string, { name: string; status: string }>();
  /** `workspaceId → userId → vai trò ACTIVE`. */
  readonly members = new Map<string, Map<string, WorkspaceRoleValue>>();
  readonly usersById = new Map<string, DirectoryUser>();

  addWorkspace(id: string, status = "ACTIVE", name = `Nhóm ${id.slice(-4)}`): void {
    this.workspaces.set(id, { name, status });
  }

  addUser(id: string, name = `Người ${id.slice(-4)}`, overrides: Partial<DirectoryUser> = {}): DirectoryUser {
    const user: DirectoryUser = { id, name, status: "ACTIVE", sessionVersion: 1, ...overrides };
    this.usersById.set(id, user);
    return user;
  }

  addMember(workspaceId: string, userId: string, role: WorkspaceRoleValue): void {
    const map = this.members.get(workspaceId) ?? new Map<string, WorkspaceRoleValue>();
    map.set(userId, role);
    this.members.set(workspaceId, map);
    if (!this.usersById.has(userId)) this.addUser(userId);
  }

  async workspaceStatus(workspaceId: string): Promise<string | null> {
    return this.workspaces.get(workspaceId)?.status ?? null;
  }

  async activeMemberIds(workspaceId: string): Promise<string[]> {
    return [...(this.members.get(workspaceId) ?? [])].filter(([, role]) => role !== "GUEST").map(([id]) => id);
  }

  async activeRoles(workspaceId: string, userIds: string[]): Promise<Map<string, WorkspaceRoleValue>> {
    const map = this.members.get(workspaceId) ?? new Map<string, WorkspaceRoleValue>();
    return new Map(userIds.flatMap((id) => (map.has(id) ? [[id, map.get(id) as WorkspaceRoleValue] as [string, WorkspaceRoleValue]] : [])));
  }

  async users(ids: string[]): Promise<Map<string, PersonRef>> {
    return new Map(ids.flatMap((id) => (this.usersById.has(id) ? [[id, { id, name: this.usersById.get(id)?.name ?? "" }] as [string, PersonRef]] : [])));
  }

  async user(id: string): Promise<DirectoryUser | null> {
    return this.usersById.get(id) ?? null;
  }
}
