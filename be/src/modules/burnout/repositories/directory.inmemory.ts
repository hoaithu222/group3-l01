import type { BurnoutUser } from "../entities/burnout.interface";
import type { IBurnoutDirectory } from "./directory";

/** Test: người dùng khai tay (`users.set(id, "Asia/Ho_Chi_Minh")`); ai vắng = không hoạt động (khoá/ẩn danh hoá/không tồn tại). */
export class InMemoryBurnoutDirectory implements IBurnoutDirectory {
  readonly users = new Map<string, string>();
  /** Test: tên nhóm khai tay (`workspaces.set(id, "Nhóm A")`) — P1 danh sách chia sẻ. */
  readonly workspaces = new Map<string, string>();

  getActiveUser(userId: string): Promise<BurnoutUser | null> {
    const timezone = this.users.get(userId);
    return Promise.resolve(timezone === undefined ? null : { timezone });
  }

  activeTimezones(userIds: readonly string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of userIds) {
      const timezone = this.users.get(id);
      if (timezone !== undefined) out.set(id, timezone);
    }
    return Promise.resolve(out);
  }

  workspaceNames(ids: readonly string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of ids) {
      const name = this.workspaces.get(id);
      if (name !== undefined) out.set(id, name);
    }
    return Promise.resolve(out);
  }
}
