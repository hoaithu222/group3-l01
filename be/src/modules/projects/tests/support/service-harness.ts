/**
 * Bộ dựng dùng chung cho unit test service của `projects` (KHÔNG phải test): repository in-memory + resolver quyền
 * dùng ĐÚNG ma trận vai của `workspaces` (`computeWorkspaceActions`) + resolver BOARD thật, nên quyền được kiểm bằng
 * `permissionService` thật (không mock thứ đang được kiểm). Import chéo module CHỈ ở test để lấy ma trận vai.
 */
import { clearScopeRegistry, registerScopeResolver } from "../../../../core/permission";
import type { AuthUser } from "../../../../core/types/express";
import { newObjectId } from "../../../../core/utils/object-id";
import type { BoardColumnTemplate } from "../../../../core/constants/project";
import { computeWorkspaceActions } from "../../../workspaces/services/workspace-permission.resolver";
import type { Board } from "../../entities/board.interface";
import type { Task } from "../../entities/task.interface";
import type {
  IBoardEmitter,
  BoardRescheduledPayload,
  BoardUpdatedPayload,
  TaskActivityPayload,
  TaskChangedPayload,
  TaskMovedPayload,
  TaskReviewUpdatedPayload,
} from "../../realtime/board-emitter";
import { InMemoryBoardRepository } from "../../repositories/board.repository.inmemory";
import { InMemoryLabelRepository } from "../../repositories/label.repository.inmemory";
import {
  InMemoryEventOutbox,
  InMemoryProjectDirectory,
  InMemoryTaskActivityRepository,
  InMemoryUnitOfWork,
} from "../../repositories/project-support.inmemory";
import { InMemoryRescheduleBatchRepository } from "../../repositories/reschedule-batch.repository.inmemory";
import { InMemoryTaskChecklistRepository } from "../../repositories/task-checklist.repository.inmemory";
import { InMemoryTaskDependencyRepository } from "../../repositories/task-dependency.repository.inmemory";
import { InMemoryTaskCommentRepository } from "../../repositories/task-comment.repository.inmemory";
import { InMemoryTaskRepository } from "../../repositories/task.repository.inmemory";
import { registerBoardScopeResolver } from "../../services/board-access.resolver";
import { BoardRebalanceService } from "../../services/board-rebalance.service";
import { BoardService } from "../../services/board.service";
import { DependencyCountsRebuildService } from "../../services/dependency-counts-rebuild.service";
import { STATIC_DEPENDENCY_LIMITS, type DependencyLimits, type IDependencyLimits } from "../../services/dependency-limits";
import { DependencyService } from "../../services/dependency.service";
import { InMemoryRescheduleLock } from "../../services/reschedule-lock";
import { RescheduleBatchProcessor, type RescheduleBatchProcessorDeps } from "../../services/reschedule-batch.processor";
import { ReschedulePolicy } from "../../services/reschedule-policy";
import { RescheduleService } from "../../services/reschedule.service";
import { BoardWriteRunner } from "../../services/board-write-runner";
import { KeyedMutex } from "../../services/keyed-mutex";
import { LabelService } from "../../services/label.service";
import { ProjectAccess } from "../../services/project-access";
import type { IProjectConfig, ProjectConfig } from "../../services/project-config";
import type { IRebalanceScheduler } from "../../services/rebalance-scheduler";
import { TaskActivityWriter } from "../../services/task-activity.writer";
import { InMemoryTaskAssetPort, InMemoryTaskAttachmentRepository } from "../../services/task-asset.port";
import { TaskAttachmentService } from "../../services/task-attachment.service";
import { TaskChecklistService } from "../../services/task-checklist.service";
import { TaskCommentService } from "../../services/task-comment.service";
import type { IAuditPort, TaskDetailDeps } from "../../services/task-detail.deps";
import { TaskDetailService } from "../../services/task-detail.service";
import { TaskFeedService } from "../../services/task-feed.service";
import { TaskMoveService } from "../../services/task-move.service";
import { TaskMoveRegistry } from "../../services/task-move-policy";
import { TaskService } from "../../services/task.service";
import type { TaskServiceDeps } from "../../services/task-service.deps";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export class FakeEmitter implements IBoardEmitter {
  readonly events: { event: string; boardId: string; payload: unknown }[] = [];
  boardUpdated(boardId: string, payload: BoardUpdatedPayload): void {
    this.events.push({ event: "board:updated", boardId, payload });
  }
  taskCreated(boardId: string, payload: TaskChangedPayload): void {
    this.events.push({ event: "task:created", boardId, payload });
  }
  taskUpdated(boardId: string, payload: TaskChangedPayload): void {
    this.events.push({ event: "task:updated", boardId, payload });
  }
  taskMoved(boardId: string, payload: TaskMovedPayload): void {
    this.events.push({ event: "task:moved", boardId, payload });
  }
  taskDeleted(boardId: string, payload: { id: string; actorId: string | null }): void {
    this.events.push({ event: "task:deleted", boardId, payload });
  }
  taskActivity(boardId: string, payload: TaskActivityPayload): void {
    this.events.push({ event: "task:activity", boardId, payload });
  }
  boardRescheduled(boardId: string, payload: BoardRescheduledPayload): void {
    this.events.push({ event: "board:rescheduled", boardId, payload });
  }
  taskReviewUpdated(boardId: string, payload: TaskReviewUpdatedPayload): void {
    this.events.push({ event: "task:review-updated", boardId, payload });
  }
  of(event: string): { payload: unknown }[] {
    return this.events.filter((e) => e.event === event);
  }
}

export class FakeRebalanceScheduler implements IRebalanceScheduler {
  readonly calls: { boardId: string; columnId: string }[] = [];
  schedule(boardId: string, columnId: string): void {
    this.calls.push({ boardId, columnId });
  }
}

/** Ghi lại lời gọi audit để khẳng định (`task-comment.remove`…). */
export class FakeAudit implements IAuditPort {
  readonly records: Parameters<IAuditPort["record"]>[0][] = [];
  async record(input: Parameters<IAuditPort["record"]>[0]): Promise<void> {
    this.records.push(input);
  }
}

export const DEFAULT_TEST_CONFIG: ProjectConfig = {
  columnsMax: 12,
  perWorkspaceMax: 20,
  perBoardMax: 5000,
  defaultColumns: [
    { title: "To do", kind: "TODO" },
    { title: "In progress", kind: "IN_PROGRESS" },
    { title: "Review", kind: "REVIEW" },
    { title: "Done", kind: "DONE" },
  ] as BoardColumnTemplate[],
};

export const userOf = (id: string): AuthUser => ({ id, email: `${id}@e.com`, name: "T", role: "user", permissions: [] });

export class ServiceHarness {
  readonly workspaceId = newObjectId();
  readonly boards = new InMemoryBoardRepository();
  readonly tasks = new InMemoryTaskRepository();
  readonly labels = new InMemoryLabelRepository();
  readonly activities = new InMemoryTaskActivityRepository();
  readonly directory = new InMemoryProjectDirectory();
  readonly outbox = new InMemoryEventOutbox();
  readonly emitter = new FakeEmitter();
  readonly rebalance = new FakeRebalanceScheduler();
  readonly registry = new TaskMoveRegistry();
  readonly roles = new Map<string, Role>();
  workspaceStatus: "ACTIVE" | "ARCHIVED" = "ACTIVE";
  config: ProjectConfig = { ...DEFAULT_TEST_CONFIG };

  // ── p3-03 ── đồng hồ tăng ngặt 1 ms/lần gọi (tránh trùng mốc thời gian khi sắp xếp); `travel()` nhảy thời gian.
  private base = new Date();
  private ticks = 0;
  readonly clock = (): Date => new Date(this.base.getTime() + this.ticks++);
  readonly checklistRepo = new InMemoryTaskChecklistRepository(this.tasks);
  readonly commentRepo = new InMemoryTaskCommentRepository();
  readonly assets = new InMemoryTaskAssetPort();
  readonly attachmentRepo = new InMemoryTaskAttachmentRepository(this.assets);
  readonly audit = new FakeAudit();

  readonly access = new ProjectAccess(this.boards, this.tasks, this.labels);
  readonly runner = new BoardWriteRunner(new InMemoryUnitOfWork(), this.boards, new KeyedMutex());
  private readonly configPort: IProjectConfig = { load: async () => this.config };
  readonly activityWriter = new TaskActivityWriter(this.activities, this.clock);

  // ── p4-04 ── phụ thuộc + dời lịch (đồng hồ/múi giờ điều chỉnh được; `InMemoryUnitOfWork` KHÔNG rollback nên test rollback nằm ở integration).
  timezone = "Asia/Ho_Chi_Minh";
  /** Test đặt giới hạn hiệu lực (`rescheduleSyncMax: 2`…) — mặc định = `LIMITS`. */
  limitsOverride: Partial<DependencyLimits> = {};
  readonly limits: IDependencyLimits = { load: async () => ({ ...(await STATIC_DEPENDENCY_LIMITS.load()), ...this.limitsOverride }) };
  readonly dependencyRepo = new InMemoryTaskDependencyRepository(this.tasks);
  readonly batchRepo = new InMemoryRescheduleBatchRepository();
  readonly lock = new InMemoryRescheduleLock();
  readonly rescheduleService = new RescheduleService({
    access: this.access,
    tasks: this.tasks,
    boards: this.boards,
    dependencies: this.dependencyRepo,
    batches: this.batchRepo,
    runner: this.runner,
    activityRepo: this.activities,
    outbox: this.outbox,
    emitter: this.emitter,
    directory: this.directory,
    lock: this.lock,
    limits: this.limits,
    timezone: () => Promise.resolve(this.timezone),
    clock: this.clock,
  });
  readonly batchProcessorDeps: RescheduleBatchProcessorDeps = {
    batches: this.batchRepo,
    tasks: this.tasks,
    boards: this.boards,
    runner: this.runner,
    activityRepo: this.activities,
    outbox: this.outbox,
    emitter: this.emitter,
    limits: this.limits,
    clock: this.clock,
  };
  readonly batchProcessor = new RescheduleBatchProcessor(this.batchProcessorDeps);
  readonly dependencyService = new DependencyService({
    access: this.access,
    tasks: this.tasks,
    dependencies: this.dependencyRepo,
    runner: this.runner,
    activity: this.activityWriter,
    emitter: this.emitter,
    directory: this.directory,
    limits: this.limits,
    clock: this.clock,
  });
  readonly countsRebuild = new DependencyCountsRebuildService({ dependencies: this.dependencyRepo, emitter: this.emitter, directory: this.directory });

  private readonly deps: TaskServiceDeps = {
    boards: this.boards,
    tasks: this.tasks,
    labels: this.labels,
    directory: this.directory,
    access: this.access,
    runner: this.runner,
    config: this.configPort,
    activity: this.activityWriter,
    outbox: this.outbox,
    emitter: this.emitter,
    rebalance: this.rebalance,
    moveRegistry: this.registry,
  };
  private readonly detailDeps: TaskDetailDeps = {
    ...this.deps,
    uow: new InMemoryUnitOfWork(),
    checklist: this.checklistRepo,
    activityRepo: this.activities,
    comments: this.commentRepo,
    attachments: this.attachmentRepo,
    assets: this.assets,
    audit: this.audit,
    clock: this.clock,
    dependencies: this.dependencyRepo,
    reschedulePolicy: new ReschedulePolicy(this.rescheduleService),
  };
  readonly boardService = new BoardService({
    boards: this.boards,
    tasks: this.tasks,
    labels: this.labels,
    access: this.access,
    runner: this.runner,
    config: this.configPort,
    emitter: this.emitter,
    workspaceMutex: new KeyedMutex(),
    outbox: this.outbox,
  });
  readonly taskService = new TaskService(this.deps);
  readonly moveService = new TaskMoveService(this.deps);
  readonly labelService = new LabelService(this.labels, this.tasks, this.directory, this.access, this.emitter);
  readonly rebalanceService = new BoardRebalanceService(this.runner, this.boards, this.tasks, this.emitter);
  readonly detailService = new TaskDetailService(this.detailDeps);
  readonly checklistService = new TaskChecklistService(this.detailDeps);
  readonly attachmentService = new TaskAttachmentService(this.detailDeps);
  readonly commentService = new TaskCommentService(this.detailDeps);
  readonly feedService = new TaskFeedService(this.detailDeps);

  constructor() {
    this.activities.now = this.clock;
    this.commentRepo.now = this.clock;
    clearScopeRegistry();
    registerScopeResolver({
      type: "WORKSPACE",
      resolve: async (user) => {
        const role = this.roles.get(user.id);
        if (!role) return { visible: false, role: null, actions: new Set() };
        return { visible: true, role, actions: computeWorkspaceActions(role, this.workspaceStatus) };
      },
    });
    registerBoardScopeResolver(this.boards);
  }

  /** Nhảy đồng hồ của các service p3-03 (cửa sổ gộp activity 60 s, sửa bình luận 15 phút, hạn khôi phục 30 ngày). */
  travel(ms: number): void {
    this.base = new Date(this.base.getTime() + ms);
  }

  /** Thêm thành viên; MEMBER/ADMIN/OWNER cũng là "thành viên hợp lệ" để làm người được giao. */
  addUser(role: Role): AuthUser {
    const id = newObjectId();
    this.roles.set(id, role);
    if (role !== "GUEST") this.directory.members.add(id);
    this.directory.users.set(id, { id, name: `Người ${role}`, avatarUrl: null });
    return userOf(id);
  }

  async createBoard(owner: AuthUser): Promise<Board> {
    const dto = await this.boardService.create(owner, this.workspaceId, { name: "Bảng test" });
    const board = await this.boards.findById(dto.id);
    if (!board) throw new Error("board không tồn tại sau khi tạo");
    return board;
  }

  columnId(board: Board, kind: Task["columnKind"]): string {
    const column = board.columns.find((c) => c.kind === kind);
    if (!column) throw new Error(`Không có cột ${kind}`);
    return column.id;
  }

  /** Tạo thẻ qua service; trả `Task` đầy đủ từ repo. */
  async addTask(user: AuthUser, board: Board, title: string, extra: { columnId?: string; afterTaskId?: string } = {}): Promise<Task> {
    const { task } = await this.taskService.create(user, board.id, {
      title,
      assigneeIds: [],
      labelIds: [],
      ...extra,
    });
    const full = await this.tasks.findById(task.id);
    if (!full) throw new Error("task không tồn tại sau khi tạo");
    return full;
  }

  /** Chỉnh thẳng thẻ trong kho (dựng dữ liệu test: ngày, người làm, cột) — KHÔNG đi qua service, không đổi `version`. */
  setTask(id: string, patch: Partial<Task>): void {
    const t = this.tasks.tasks.get(id);
    if (!t) throw new Error("task không tồn tại trong kho");
    Object.assign(t, patch);
  }

  /** Tạo thẻ rồi đặt ngày (ISO) và người làm — cho test dời lịch. */
  async addDatedTask(
    user: AuthUser,
    board: Board,
    title: string,
    dates: { start?: string | null; due?: string | null } = {},
    assigneeIds: string[] = []
  ): Promise<Task> {
    const task = await this.addTask(user, board, title);
    this.setTask(task.id, {
      startDate: dates.start ? new Date(dates.start) : null,
      dueDate: dates.due ? new Date(dates.due) : null,
      assigneeIds,
    });
    return (await this.tasks.findById(task.id)) as Task;
  }
}
