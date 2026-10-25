import { runtimeConfig } from "../../../core/config/runtime-config";
import { AppError, ScopeForbiddenError, ScopeNotFoundError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { DEFAULT_TIME_ZONE, safeTimeZone } from "../../../core/utils/local-date";
import { newObjectId } from "../../../core/utils/object-id";
import type { RescheduleBodyDto } from "../dtos";
import type { ReschedulePlanItem } from "../entities/reschedule.interface";
import type { Task, TaskActivity } from "../entities/task.interface";
import type { IEventOutbox } from "../events/event-outbox";
import { rescheduleBulkJobOutbox, rescheduledOutbox } from "../events/reschedule-event.factory";
import type { IBoardEmitter } from "../realtime/board-emitter";
import type { IBoardRepository } from "../repositories/board.repository.interface";
import type { IProjectDirectory } from "../repositories/project-directory.interface";
import { DuplicateActiveBatchError, type IRescheduleBatchRepository } from "../repositories/reschedule-batch.repository.interface";
import type { ITaskActivityRepository } from "../repositories/task-activity.repository.interface";
import type { ITaskDependencyRepository } from "../repositories/task-dependency.repository.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { TxContext } from "../repositories/unit-of-work";
import type { BoardWriteRunner } from "./board-write-runner";
import { STATIC_DEPENDENCY_LIMITS, type DependencyLimits, type IDependencyLimits } from "./dependency-limits";
import type { ProjectAccess } from "./project-access";
import { applyRescheduleItems, applySourceChange, type SourceChange } from "./reschedule-apply";
import { toBatchDto, type RescheduleBatchDto } from "./reschedule-batch.presenter";
import type { IRescheduleLock } from "./reschedule-lock";
import type { PlanAffected, PlanSkipped, ReschedulePlan } from "./reschedule-planner";
import { buildReschedulePlan, toPreviewDto, type RescheduleInput, type ReschedulePreviewResultDto } from "./reschedule-preview";
import { logger } from "../../../infrastructure/logger";
import { TaskPublisher } from "./task-publisher";

export type { ReschedulePreviewResultDto } from "./reschedule-preview";

export interface RescheduleServiceDeps {
  access: ProjectAccess;
  tasks: ITaskRepository;
  boards: IBoardRepository;
  dependencies: ITaskDependencyRepository;
  batches: IRescheduleBatchRepository;
  /** Hàng đợi ghi của BẢNG — dời lịch không chồng lên kéo/tạo thẻ; tranh chấp kéo dài → 503 (KHÔNG 500 thô). */
  runner: BoardWriteRunner;
  activityRepo: ITaskActivityRepository;
  outbox: IEventOutbox;
  emitter: IBoardEmitter;
  directory: IProjectDirectory;
  lock: IRescheduleLock;
  limits?: IDependencyLimits;
  /** Múi giờ tính "ngày" của NHÓM chứa bảng — container truyền bản đọc `Workspace.timezone` → `pm.timezone` → `CRON_TZ`; vắng thì `projectTimezone()` (mặc định hệ thống). */
  timezone?: (workspaceId: string) => Promise<string>;
  clock?: () => Date;
}

export interface RescheduleAppliedDto {
  rescheduleId: string;
  /** Thẻ ĐÃ dời (nguồn đứng đầu nếu ngày của nó đổi) — `version` là phiên bản mới để client cập nhật cache. */
  applied: { taskId: string; newStartDate: string | null; newDueDate: string | null; version: number }[];
  skipped: PlanSkipped[];
}

export type RescheduleOutcome =
  | { status: 200; data: RescheduleAppliedDto }
  | { status: 202; data: { batchId: string; affectedCount: number } };

const conflict = (code: "TASK_019" | "TASK_020", details?: Record<string, unknown>): AppError =>
  new AppError(ErrorMessages[ErrorCode[code]], 409, ErrorCode[code], details);

/** Đổi ngoài ý muốn giữa lúc xem trước và lúc áp (thẻ SAU bị sửa) — huỷ cả transaction đồng bộ. */
class RescheduleConflictError extends Error {}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Múi giờ tính "ngày" của phân hệ dự án: `SystemConfig pm.timezone` nếu hợp lệ, mặc định `Asia/Ho_Chi_Minh`. */
export async function projectTimezone(): Promise<string> {
  try {
    const pm: Record<string, unknown> = await runtimeConfig.getEffective("pm");
    return safeTimeZone(typeof pm["timezone"] === "string" ? pm["timezone"] : DEFAULT_TIME_ZONE);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export const toPlanItem = (a: PlanAffected): ReschedulePlanItem => ({
  taskId: a.taskId,
  expectedVersion: a.expectedVersion,
  oldStartDate: a.oldStartDate,
  oldDueDate: a.oldDueDate,
  newStartDate: a.newStartDate,
  newDueDate: a.newDueDate,
  assigneeIds: a.assigneeIds,
  result: null,
});

/**
 * Dời lịch theo phụ thuộc (p4-04 be.md §5.3–§5.4). `preview` CHỈ ĐỌC. `apply`: khoá Redis theo bảng → tính lại + so `previewToken`
 * → đồng bộ (≤ `rescheduleSyncMax` thẻ, MỘT transaction, CAS từng thẻ) hoặc tạo `RescheduleBatch` + outbox job nền (`202`).
 * Nhắc hạn đặt lại qua outbox `task.due-changed` → sink p3-03 (bền qua crash) nên không có `rescheduleMany` gọi trực tiếp.
 */
export class RescheduleService {
  private readonly publisher: TaskPublisher;

  constructor(private readonly d: RescheduleServiceDeps) {
    this.publisher = new TaskPublisher(d.emitter, d.directory, d.clock);
  }

  async preview(user: AuthUser, taskId: string, body: RescheduleInput): Promise<ReschedulePreviewResultDto> {
    const { task } = await this.d.access.task(user, taskId, "workspace.board.read");
    return this.previewFor(task, body);
  }

  /** KHÔNG kiểm quyền — caller (`preview`, `ReschedulePolicy` của PATCH) đã kiểm quyền trên thẻ. */
  async previewFor(source: Task, body: RescheduleInput): Promise<ReschedulePreviewResultDto> {
    const [limits, tz] = await Promise.all([this.limits(), this.tz(source.workspaceId)]);
    return toPreviewDto(source, body, await buildReschedulePlan(this.d.dependencies, limits, source, body, tz), tz);
  }

  async apply(user: AuthUser, taskId: string, body: RescheduleBodyDto): Promise<RescheduleOutcome> {
    const { task: seen } = await this.d.access.task(user, taskId, "workspace.task.update");
    if (seen.version !== body.expectedVersion) throw new VersionConflictError(seen.version);
    const start = body.startDate !== undefined ? body.startDate : seen.startDate;
    if (start && start.getTime() > body.dueDate.getTime()) {
      throw new AppError(ErrorMessages[ErrorCode.TASK_013], 400, ErrorCode.TASK_013, { startDate: ["Ngày bắt đầu phải trước hạn chót"] });
    }
    const lock = await this.d.lock.acquire(seen.boardId);
    if (!lock) throw conflict("TASK_020");
    try {
      if (await this.d.batches.findActiveByBoard(seen.boardId)) throw conflict("TASK_020");
      const [limits, tz] = await Promise.all([this.limits(), this.tz(seen.workspaceId)]);
      const plan = await buildReschedulePlan(this.d.dependencies, limits, seen, body, tz);
      if (plan.previewToken !== body.previewToken) throw conflict("TASK_019", { preview: toPreviewDto(seen, body, plan, tz) });
      return plan.mode === "BULK" ? await this.enqueueBulk(user, seen, body, plan) : await this.applySync(user, seen, body, plan, tz, limits);
    } finally {
      await this.d.lock.release(lock);
    }
  }

  /** Người yêu cầu hoặc OWNER/ADMIN (`workspace.board.edit`); người khác → 404 trung tính. */
  async batchStatus(user: AuthUser, batchId: string): Promise<RescheduleBatchDto> {
    const batch = await this.d.batches.findById(batchId);
    if (!batch) throw new ScopeNotFoundError();
    const { access } = await this.d.access.board(user, batch.boardId, "workspace.board.read");
    if (batch.requestedBy !== user.id && !access.actions.has("workspace.board.edit")) throw new ScopeNotFoundError();
    const conflicts = batch.items.filter((i) => i.result === "CONFLICT").slice(0, 50);
    const titles = new Map((await this.d.tasks.findLiveByIds(conflicts.map((i) => i.taskId))).map((t) => [t.id, t.title]));
    return toBatchDto(batch, titles);
  }

  private async applySync(
    user: AuthUser,
    seen: Task,
    body: RescheduleBodyDto,
    plan: ReschedulePlan,
    tz: string,
    limits: DependencyLimits
  ): Promise<RescheduleOutcome> {
    const rescheduleId = newObjectId();
    const items = plan.affected.map(toPlanItem);
    const ctx = { actorId: user.id, boardId: seen.boardId, workspaceId: seen.workspaceId, sourceTaskId: seen.id, rescheduleId, batchId: null };
    try {
      const { source, res } = await this.d.runner.run(seen.boardId, async (tx) => {
        await this.assertWritable(seen.boardId, tx);
        const source = await applySourceChange(this.d, tx, user.id, seen.id, body);
        if (!source) throw new ScopeNotFoundError();
        const res = await applyRescheduleItems(this.d, tx, ctx, items);
        if (res.conflicts.length > 0) throw new RescheduleConflictError();
        if (res.applied.length > 0) {
          const applied = res.applied.map((a) => a.item);
          await this.d.outbox.add(tx, rescheduledOutbox({ ...ctx, items: applied }));
        }
        return { source, res };
      });
      await this.publishSource(user.id, source);
      await this.publishApplied(user.id, seen.boardId, res.applied.map((a) => a.item.taskId), res.activities, rescheduleId, limits);
      const sourceApplied = source.after ? [{ taskId: source.after.id, newStartDate: iso(source.after.startDate), newDueDate: iso(source.after.dueDate), version: source.after.version }] : [];
      const rest = res.applied.map((a) => ({ taskId: a.item.taskId, newStartDate: iso(a.item.newStartDate), newDueDate: iso(a.item.newDueDate), version: a.newVersion }));
      return { status: 200, data: { rescheduleId, applied: [...sourceApplied, ...rest], skipped: plan.skipped } };
    } catch (err) {
      if (!(err instanceof RescheduleConflictError)) throw err;
      // Transaction đã huỷ: một thẻ SAU vừa bị sửa — trả bản xem trước MỚI để client xác nhận lại.
      const fresh = (await this.d.tasks.findById(seen.id)) ?? seen;
      throw conflict("TASK_019", { preview: await this.previewFor(fresh, body) });
    }
  }

  private async enqueueBulk(user: AuthUser, seen: Task, body: RescheduleBodyDto, plan: ReschedulePlan): Promise<RescheduleOutcome> {
    const items = plan.affected.map(toPlanItem);
    try {
      const { batch, source } = await this.d.runner.run(seen.boardId, async (tx) => {
        await this.assertWritable(seen.boardId, tx);
        const source = await applySourceChange(this.d, tx, user.id, seen.id, body);
        if (!source) throw new ScopeNotFoundError();
        const batch = await this.d.batches.create(
          { workspaceId: seen.workspaceId, boardId: seen.boardId, sourceTaskId: seen.id, requestedBy: user.id, sourceDueDate: body.dueDate, items },
          tx
        );
        await this.d.outbox.add(tx, rescheduleBulkJobOutbox({ batchId: batch.id, boardId: batch.boardId, workspaceId: batch.workspaceId }));
        return { batch, source };
      });
      await this.publishSource(user.id, source);
      return { status: 202, data: { batchId: batch.id, affectedCount: batch.affectedCount } };
    } catch (err) {
      // Đua tạo lô (Redis mất khoá giữa chừng): unique `activeKey` chặn — transaction đã huỷ, trả TASK_020 NGOÀI transaction.
      if (err instanceof DuplicateActiveBatchError) throw conflict("TASK_020");
      throw err;
    }
  }

  private async assertWritable(boardId: string, tx: TxContext): Promise<void> {
    const board = await this.d.boards.findById(boardId, tx);
    if (!board) throw new ScopeNotFoundError();
    if (board.archivedAt) throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
  }

  /** Realtime SAU commit (best-effort): thẻ nguồn luôn có `task:updated` (+ nhật ký của nó). */
  private async publishSource(actorId: string, source: SourceChange): Promise<void> {
    if (!source.after) return;
    try {
      await Promise.all([this.publisher.updated(source.after, actorId, ["dates"]), this.publisher.activities(source.after.boardId, source.activities)]);
    } catch (err) {
      this.warn(source.after.boardId, err);
    }
  }

  /**
   * ≤ `rescheduleEmitEachMax` thẻ SAU → `task:updated` từng thẻ (đọc lại MỘT lần theo lô, không N+1) + nhật ký; nhiều hơn → MỘT
   * `board:rescheduled` thay thế (be.md §5.4 bước 5).
   */
  private async publishApplied(
    actorId: string,
    boardId: string,
    appliedIds: string[],
    activities: TaskActivity[],
    rescheduleId: string,
    limits: DependencyLimits
  ): Promise<void> {
    if (appliedIds.length === 0) return;
    try {
      if (appliedIds.length > limits.rescheduleEmitEachMax) {
        this.d.emitter.boardRescheduled(boardId, { boardId, rescheduleId, taskIds: appliedIds, count: appliedIds.length, final: true });
        return;
      }
      for (const t of await this.d.tasks.findLiveByIds(appliedIds)) await this.publisher.updated(t, actorId, ["dates"]);
      await this.publisher.activities(boardId, activities);
    } catch (err) {
      this.warn(boardId, err);
    }
  }

  private warn(boardId: string, err: unknown): void {
    logger.warn("[projects] phát realtime dời lịch thất bại", { boardId, error: err instanceof Error ? err.message : String(err) });
  }

  private limits(): Promise<DependencyLimits> {
    return (this.d.limits ?? STATIC_DEPENDENCY_LIMITS).load();
  }

  private tz(workspaceId: string): Promise<string> {
    return this.d.timezone ? this.d.timezone(workspaceId) : projectTimezone();
  }
}
