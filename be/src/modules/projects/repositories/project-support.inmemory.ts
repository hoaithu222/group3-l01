import { normalizeSearch } from "../../../core/utils/normalize";
import { newObjectId } from "../../../core/utils/object-id";
import type { OutboxEventInput } from "../../../infrastructure/queue/outbox/outbox.types";
import type { TaskActivity, TaskActivityInput } from "../entities/task.interface";
import type { IEventOutbox } from "../events/event-outbox";
import type { IProjectDirectory, UserSummary } from "./project-directory.interface";
import type { ITaskActivityRepository } from "./task-activity.repository.interface";
import type { IProjectsUnitOfWork, TxContext } from "./unit-of-work";

/** Đơn vị công việc giả: chạy thẳng `fn` (không rollback). */
export class InMemoryUnitOfWork implements IProjectsUnitOfWork {
  run<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
    return fn({ __projectsTx: true });
  }
}

export class InMemoryTaskActivityRepository implements ITaskActivityRepository {
  readonly activities: TaskActivity[] = [];
  private lastAt = 0;
  /** Đồng hồ (test cửa sổ gộp 60 s tiêm bản giả). Mặc định giờ thật NHƯNG tăng ngặt — hai bản ghi không bao giờ trùng `at`. */
  now: () => Date = () => {
    this.lastAt = Math.max(Date.now(), this.lastAt + 1);
    return new Date(this.lastAt);
  };

  async create(input: TaskActivityInput): Promise<TaskActivity> {
    const activity: TaskActivity = { ...input, id: newObjectId(), at: this.now() };
    this.activities.push(activity);
    return structuredClone(activity);
  }

  async createMany(inputs: TaskActivityInput[]): Promise<TaskActivity[]> {
    const out: TaskActivity[] = [];
    for (const input of inputs) out.push(await this.create(input));
    return out;
  }

  async findLatest(taskId: string): Promise<TaskActivity | null> {
    const rows = this.activities.filter((a) => a.taskId === taskId);
    return rows.length > 0 ? structuredClone(this.newestFirst(rows)[0]) : null;
  }

  async updateGrouped(id: string, patch: { type: string; after: Record<string, unknown> | null }): Promise<TaskActivity | null> {
    const a = this.activities.find((x) => x.id === id);
    if (!a) return null;
    a.type = patch.type;
    a.after = patch.after;
    return structuredClone(a);
  }

  async list(taskId: string, cursor: { at: Date; id: string } | null, limit: number) {
    const rows = this.newestFirst(this.activities.filter((a) => a.taskId === taskId)).filter(
      (a) => !cursor || a.at < cursor.at || (a.at.getTime() === cursor.at.getTime() && a.id < cursor.id)
    );
    return { items: rows.slice(0, limit).map((a) => structuredClone(a)), hasMore: rows.length > limit };
  }

  private newestFirst(rows: TaskActivity[]): TaskActivity[] {
    return [...rows].sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  }
}

/** Thu thập hàng outbox để test kiểm dedupeKey/payload. */
export class InMemoryEventOutbox implements IEventOutbox {
  readonly events: OutboxEventInput[] = [];

  async add(_tx: TxContext, event: OutboxEventInput): Promise<void> {
    if (this.events.some((e) => e.dedupeKey === event.dedupeKey)) throw new Error(`dedupeKey trùng: ${event.dedupeKey}`);
    this.events.push(event);
  }

  async addMany(tx: TxContext, events: OutboxEventInput[]): Promise<void> {
    for (const e of events) await this.add(tx, e);
  }
}

/** Thư mục thành viên/người dùng giả. `members` = id là thành viên ACTIVE không phải GUEST. */
export class InMemoryProjectDirectory implements IProjectDirectory {
  constructor(
    readonly members: Set<string> = new Set(),
    readonly users: Map<string, UserSummary> = new Map()
  ) {}

  async activeMemberIds(_workspaceId: string, userIds: string[]): Promise<Set<string>> {
    return new Set(userIds.filter((id) => this.members.has(id)));
  }

  async userSummaries(userIds: string[]): Promise<Map<string, UserSummary>> {
    return new Map(userIds.flatMap((id) => (this.users.has(id) ? [[id, this.users.get(id) as UserSummary] as const] : [])));
  }

  async searchMentionables(_workspaceId: string, q: string, limit: number): Promise<UserSummary[]> {
    const tokens = normalizeSearch(q).split(" ").filter(Boolean);
    return [...this.members]
      .flatMap((id) => (this.users.has(id) ? [this.users.get(id) as UserSummary] : []))
      .filter((u) => {
        const words = normalizeSearch(u.name).split(" ").filter(Boolean);
        return tokens.every((t) => words.some((w) => w.startsWith(t)));
      })
      .sort((a, b) => a.name.localeCompare(b.name, "vi"))
      .slice(0, limit);
  }

  readonly notifications = new Set<string>();

  async notificationExists(dedupeKey: string): Promise<boolean> {
    return this.notifications.has(dedupeKey);
  }

  // ── p4-05 ── OWNER/ADMIN, tài khoản không còn hoạt động, tên bảng/nhóm cho test chấm chéo.
  readonly admins = new Set<string>();
  /** Tài khoản đã khoá/ẩn danh hoá (vẫn có thể còn membership) — không được làm ứng viên chấm. */
  readonly inactive = new Set<string>();
  readonly boardNameMap = new Map<string, string>();
  readonly workspaceNameMap = new Map<string, string>();

  async listReviewerCandidateIds(_workspaceId: string, limit: number): Promise<string[]> {
    return [...this.members].filter((id) => !this.inactive.has(id)).sort().slice(0, limit);
  }

  async activeReviewerIds(_workspaceId: string, userIds: string[]): Promise<Set<string>> {
    return new Set(userIds.filter((id) => this.members.has(id) && !this.inactive.has(id)));
  }

  async listAdminIds(_workspaceId: string): Promise<string[]> {
    return [...this.admins].filter((id) => this.members.has(id));
  }

  async boardNames(boardIds: string[]): Promise<Map<string, string>> {
    return new Map(boardIds.flatMap((id) => (this.boardNameMap.has(id) ? [[id, this.boardNameMap.get(id) as string] as const] : [])));
  }

  async workspaceNames(workspaceIds: string[]): Promise<Map<string, string>> {
    return new Map(workspaceIds.flatMap((id) => (this.workspaceNameMap.has(id) ? [[id, this.workspaceNameMap.get(id) as string] as const] : [])));
  }

  async workspaceIdsWhereMember(userId: string, workspaceIds: string[]): Promise<Set<string>> {
    return this.members.has(userId) ? new Set(workspaceIds) : new Set();
  }

  /** `Workspace.timezone` thô theo nhóm (test đặt bằng `workspaceTimezones.set(wsId, "Asia/Tokyo")`). */
  readonly workspaceTimezones = new Map<string, string>();

  async workspaceTimezone(workspaceId: string): Promise<string | null> {
    return this.workspaceTimezones.get(workspaceId) ?? null;
  }
}
