import { LIMITS } from "../../../core/constants/limits";
import type { TaskWatchState } from "../../../core/constants/project";
import type { AuthUser } from "../../../core/types/express";
import type { IProjectDirectory, UserSummary } from "../repositories/project-directory.interface";
import type { ITaskWatcherRepository } from "../repositories/task-watcher.repository.interface";
import type { ProjectAccess } from "./project-access";
import { isWatching, withWatchers, type WatchRow } from "./task-watch-policy";

export interface WatchStatusDto {
  watching: boolean;
  /** Lựa chọn đã lưu; `null` = chưa chọn (theo dõi ngầm định nếu là người làm/người tạo). */
  state: TaskWatchState | null;
}

export interface WatcherDto {
  user: UserSummary;
  /** `IMPLICIT` = người làm/người tạo chưa có lựa chọn riêng. */
  state: TaskWatchState | "IMPLICIT";
}

export interface WatchersDto {
  watchers: WatcherDto[];
  total: number;
  me: WatchStatusDto;
}

export interface TaskWatchDeps {
  access: ProjectAccess;
  directory: IProjectDirectory;
  watchers: ITaskWatcherRepository;
}

const RANK: Record<WatcherDto["state"], number> = { EXPLICIT_ON: 0, AUTO_ON: 1, IMPLICIT: 2, EXPLICIT_OFF: 3 };

/**
 * Theo dõi thẻ (p3-03 P1). Quyền: `workspace.board.read` — ai thấy thẻ thì theo dõi được (GUEST/người ngoài → 404, đúng quy ước module). Theo dõi là
 * SỞ THÍCH CÁ NHÂN nên vẫn dùng được trên bảng đã lưu trữ. `PUT` = `EXPLICIT_ON`, `DELETE` = `EXPLICIT_OFF` (tắt cả khi là người làm/người tạo — chỉ
 * ảnh hưởng thông báo bình luận/nhắc hạn, KHÔNG ảnh hưởng thông báo được giao/được nhắc tên). `AUTO_ON` do sink thông báo ghi (`TaskWatchService` không tạo).
 */
export class TaskWatchService {
  constructor(private readonly d: TaskWatchDeps) {}

  async watch(user: AuthUser, taskId: string): Promise<WatchStatusDto> {
    return this.set(user, taskId, "EXPLICIT_ON");
  }

  async unwatch(user: AuthUser, taskId: string): Promise<WatchStatusDto> {
    return this.set(user, taskId, "EXPLICIT_OFF");
  }

  async list(user: AuthUser, taskId: string): Promise<WatchersDto> {
    const { task } = await this.d.access.task(user, taskId, "workspace.board.read");
    const implicit = [...new Set([...task.assigneeIds, task.createdBy])];
    const rows: WatchRow[] = await this.d.watchers.listByTask(taskId, LIMITS.task.watchersListMax);
    const entries = new Map<string, WatcherDto["state"]>();
    for (const id of withWatchers(implicit, rows)) entries.set(id, rows.find((r) => r.userId === id)?.state ?? "IMPLICIT");

    const ids = [...entries.keys()];
    const [active, summaries, mine] = await Promise.all([
      this.d.directory.activeMemberIds(task.workspaceId, ids),
      this.d.directory.userSummaries(ids),
      this.d.watchers.find(taskId, user.id),
    ]);
    const watchers = ids
      .filter((id) => active.has(id))
      .map((id): WatcherDto => ({ user: summaries.get(id) ?? { id, name: "", avatarUrl: null }, state: entries.get(id) as WatcherDto["state"] }))
      .sort((a, b) => RANK[a.state] - RANK[b.state] || a.user.name.localeCompare(b.user.name, "vi"));
    return { watchers, total: watchers.length, me: { watching: isWatching(user.id, implicit, mine), state: mine?.state ?? null } };
  }

  private async set(user: AuthUser, taskId: string, state: "EXPLICIT_ON" | "EXPLICIT_OFF"): Promise<WatchStatusDto> {
    await this.d.access.task(user, taskId, "workspace.board.read");
    const row = await this.d.watchers.setExplicit(taskId, user.id, state);
    return { watching: row.state !== "EXPLICIT_OFF", state: row.state };
  }
}
