import { AuditService } from "../audit-log/audit-log.service";
import { PrismaEventOutbox, type IEventOutbox } from "./events/event-outbox";
import { SocketBoardEmitter, type IBoardEmitter } from "./realtime/board-emitter";
import { PrismaBoardRepository } from "./repositories/board.repository.prisma";
import { PrismaLabelRepository } from "./repositories/label.repository.prisma";
import { PrismaProjectDirectory } from "./repositories/project-directory.repository.prisma";
import { PrismaProjectStatsRepository } from "./repositories/project-stats.repository.prisma";
import { PrismaRescheduleBatchRepository } from "./repositories/reschedule-batch.repository.prisma";
import { PrismaTaskActivityRepository } from "./repositories/task-activity.repository.prisma";
import { PrismaTaskAttachmentRepository } from "./repositories/task-attachment.repository.prisma";
import { PrismaTaskChecklistRepository } from "./repositories/task-checklist.repository.prisma";
import { PrismaTaskCommentRepository } from "./repositories/task-comment.repository.prisma";
import { PrismaTaskDependencyRepository } from "./repositories/task-dependency.repository.prisma";
import { PrismaTaskWatcherRepository } from "./repositories/task-watcher.repository.prisma";
import { PrismaTaskRepository } from "./repositories/task.repository.prisma";
import { PrismaReviewStatsRepository } from "./repositories/review-stats.repository.prisma";
import { PrismaTaskReviewRepository } from "./repositories/task-review.repository.prisma";
import { PrismaTaskReviewRoundRepository } from "./repositories/task-review-round.repository.prisma";
import { PrismaProjectsUnitOfWork } from "./repositories/prisma-tx";
import { AdminProjectStatsService } from "./services/admin-project-stats.service";
import { BoardRebalanceService } from "./services/board-rebalance.service";
import { BoardBlueprintService } from "./services/board-blueprint.service";
import { BoardService } from "./services/board.service";
import { BoardWriteRunner } from "./services/board-write-runner";
import { DependencyCountsRebuildService } from "./services/dependency-counts-rebuild.service";
import { RuntimeDependencyLimits, type IDependencyLimits } from "./services/dependency-limits";
import { DependencyService } from "./services/dependency.service";
import { RescheduleBatchProcessor } from "./services/reschedule-batch.processor";
import { RescheduleBatchSweeper } from "./services/reschedule-batch-sweeper";
import { RedisRescheduleLock, type IRescheduleLock } from "./services/reschedule-lock";
import { ReschedulePolicy } from "./services/reschedule-policy";
import { RescheduleService } from "./services/reschedule.service";
import { effectiveWorkspaceTimeZone, systemDefaultTimeZone } from "../../core/config/workspace-timezone";
import { GanttService } from "./services/gantt.service";
import { KeyedMutex } from "./services/keyed-mutex";
import { LabelService } from "./services/label.service";
import { ProjectAccess } from "./services/project-access";
import { RuntimeProjectConfig, type IProjectConfig } from "./services/project-config";
import { QueueRebalanceScheduler, type IRebalanceScheduler } from "./services/rebalance-scheduler";
import { TaskActivityWriter } from "./services/task-activity.writer";
import { TaskAttachmentService } from "./services/task-attachment.service";
import { TaskChecklistService } from "./services/task-checklist.service";
import { TaskCommentService } from "./services/task-comment.service";
import type { IAuditPort, TaskDetailDeps } from "./services/task-detail.deps";
import { TaskDetailService } from "./services/task-detail.service";
import { TaskConvertService } from "./services/task-convert.service";
import { TaskDuplicateService } from "./services/task-duplicate.service";
import { TaskFeedService } from "./services/task-feed.service";
import { TaskWatchService } from "./services/task-watch.service";
import { TaskMoveService } from "./services/task-move.service";
import { taskMoveRegistry, type TaskMoveRegistry } from "./services/task-move-policy";
import { ReviewAutoComplete } from "./services/review/review-auto-complete";
import { ReviewBackfillService } from "./services/review/review-backfill.service";
import { ReviewConfigService } from "./services/review/review-config.service";
import { RuntimeReviewDefaults, type IReviewDefaults } from "./services/review/review-defaults";
import { ReviewDonePolicy } from "./services/review/review-done.policy";
import { ReviewPublisher } from "./services/review/review-publisher";
import { ReviewQueryService } from "./services/review/review-query.service";
import { ReviewReassignService } from "./services/review/review-reassign.service";
import { ReviewReconcileService } from "./services/review/review-reconcile.service";
import { BullReviewReminders, type IReviewReminders } from "./services/review/review-reminders";
import { ReviewRoundEffect } from "./services/review/review-round.effect";
import { ReviewRoundService } from "./services/review/review-round.service";
import { ReviewStatsService } from "./services/review/review-stats.service";
import { ReviewSubmitService } from "./services/review/review-submit.service";
import { ReviewWaiveService } from "./services/review/review-waive.service";
import type { ReviewDeps } from "./services/review/review.deps";
import { PublicTaskAssetPort } from "./services/task-asset.port.public";
import type { ITaskAssetPort } from "./services/task-asset.port";
import { TaskService } from "./services/task.service";

/** Hàng đợi ghi dùng chung MỌI container của tiến trình (routes + job) để cùng xếp hàng một bảng. */
const sharedBoardMutex = new KeyedMutex();
const sharedWorkspaceMutex = new KeyedMutex();
/** Hàng đợi theo thẻ cho đính kèm/bình luận (p3-03) — dùng chung mọi container của tiến trình. */
const sharedTaskMutex = new KeyedMutex();

export interface ProjectsContainerOptions {
  boardMutex?: KeyedMutex;
  workspaceMutex?: KeyedMutex;
  config?: IProjectConfig;
  emitter?: IBoardEmitter;
  rebalance?: IRebalanceScheduler;
  outbox?: IEventOutbox;
  moveRegistry?: TaskMoveRegistry;
  /** p3-03: cổng asset/audit (test tích hợp thay bằng bản giả khi cần). */
  assets?: ITaskAssetPort;
  audit?: IAuditPort;
  /** p4-04: khoá dời lịch theo bảng + giới hạn phụ thuộc/dời lịch (test thay bằng bản giả/tĩnh khi cần). */
  rescheduleLock?: IRescheduleLock;
  dependencyLimits?: IDependencyLimits;
  /** p4-05: mặc định chấm chéo (`SystemConfig pm.review`) + hàng đợi hẹn giờ nhắc (test thay bằng bản giả/tĩnh). */
  reviewDefaults?: IReviewDefaults;
  reviewReminders?: IReviewReminders;
}

/**
 * Nối dây DI cho module Dự án — dùng CHUNG bởi `projects.routes.ts` và các job (tiến trình worker riêng không import
 * routes nên tự dựng lại, xem `jobs/*.ts`). Không có DI container trong codebase (architecture.md).
 * p3-03 thêm `TaskDetailService`/checklist/đính kèm/bình luận trên cùng bộ phụ thuộc (`TaskDetailDeps`).
 */
export function createProjectsContainer(opts: ProjectsContainerOptions = {}) {
  const boards = new PrismaBoardRepository();
  const tasks = new PrismaTaskRepository();
  const labels = new PrismaLabelRepository();
  const directory = new PrismaProjectDirectory();
  const access = new ProjectAccess(boards, tasks, labels);
  const uow = new PrismaProjectsUnitOfWork();
  const runner = new BoardWriteRunner(uow, boards, opts.boardMutex ?? sharedBoardMutex);
  const config = opts.config ?? new RuntimeProjectConfig();
  const emitter = opts.emitter ?? new SocketBoardEmitter();
  const activityRepo = new PrismaTaskActivityRepository();
  const comments = new PrismaTaskCommentRepository();
  const dependencies = new PrismaTaskDependencyRepository();
  const watchers = new PrismaTaskWatcherRepository();
  const batches = new PrismaRescheduleBatchRepository();
  const outbox = opts.outbox ?? new PrismaEventOutbox();
  const limits = opts.dependencyLimits ?? new RuntimeDependencyLimits();
  const activity = new TaskActivityWriter(activityRepo);
  const rebalance = opts.rebalance ?? new QueueRebalanceScheduler();
  const audit = opts.audit ?? new AuditService();
  /** Múi giờ tính "ngày" của một nhóm: `Workspace.timezone` (nếu OWNER/ADMIN đã đặt) → `pm.timezone` → `CRON_TZ` (đồng bộ chéo #9). Lỗi đọc → mặc định hệ thống. */
  const workspaceTimezone = async (workspaceId: string): Promise<string> =>
    effectiveWorkspaceTimeZone(await directory.workspaceTimezone(workspaceId).catch(() => null), await systemDefaultTimeZone());

  /** p4-05: chấm chéo xoay vòng — chính sách chặn DONE + hiệu ứng vào/rời REVIEW (đăng ký ở `registerProjectsModule`), nộp/giao lại/miễn, đối soát. */
  const reviewRounds = new PrismaTaskReviewRoundRepository();
  const taskDeps = {
    boards,
    tasks,
    labels,
    directory,
    access,
    runner,
    config,
    emitter,
    activity,
    outbox,
    rebalance,
    moveRegistry: opts.moveRegistry ?? taskMoveRegistry,
    reviewProgress: reviewRounds,
  };
  const moveService = new TaskMoveService(taskDeps);
  const taskService = new TaskService(taskDeps);
  const reviewDeps: ReviewDeps = {
    rounds: reviewRounds,
    reviews: new PrismaTaskReviewRepository(),
    tasks,
    boards,
    directory,
    access,
    runner,
    activity,
    outbox,
    audit,
    emitter,
    rebalance,
    defaults: opts.reviewDefaults ?? new RuntimeReviewDefaults(),
  };
  const boardService = new BoardService({
    boards,
    tasks,
    labels,
    access,
    runner,
    config,
    emitter,
    workspaceMutex: opts.workspaceMutex ?? sharedWorkspaceMutex,
    reviewDefaults: reviewDeps.defaults,
    outbox,
  });
  const reviewReminders = opts.reviewReminders ?? new BullReviewReminders();
  const reviewPublisher = new ReviewPublisher(reviewDeps);
  const reviewRoundService = new ReviewRoundService(reviewDeps);
  // P1 `autoCompleteOnApproval`: đủ duyệt ⇒ hệ thống chuyển thẻ sang DONE qua CHÍNH `moveService` (policy/effect/activity/outbox như kéo tay).
  const reviewAutoComplete = new ReviewAutoComplete(reviewDeps, moveService);
  const reviewReassign = new ReviewReassignService(reviewDeps, reviewRoundService, reviewPublisher, reviewReminders, reviewAutoComplete);
  const reviewQuery = new ReviewQueryService(reviewDeps);

  /** p4-04: dời lịch theo phụ thuộc — preview (chỉ đọc), áp đồng bộ/lô nền, trạng thái lô. */
  const rescheduleService = new RescheduleService({
    access,
    tasks,
    boards,
    dependencies,
    batches,
    runner,
    activityRepo,
    outbox,
    emitter,
    directory,
    lock: opts.rescheduleLock ?? new RedisRescheduleLock(),
    limits,
    timezone: workspaceTimezone,
  });

  const rescheduleBatchProcessor = new RescheduleBatchProcessor({ batches, tasks, boards, runner, activityRepo, outbox, emitter, limits });

  const detailDeps: TaskDetailDeps = {
    ...taskDeps,
    uow,
    checklist: new PrismaTaskChecklistRepository(),
    activityRepo,
    comments,
    attachments: new PrismaTaskAttachmentRepository(),
    assets: opts.assets ?? new PublicTaskAssetPort(),
    audit,
    taskMutex: sharedTaskMutex,
    // p4-04: `TaskDetailDto.dependencies` + chặn PATCH lùi hạn (`TASK_006`).
    dependencies,
    reschedulePolicy: new ReschedulePolicy(rescheduleService),
    reviews: reviewQuery,
  };

  return {
    boards,
    tasks,
    labels,
    comments,
    watchers,
    directory,
    access,
    boardService,
    /** p3-02 (P1): mẫu bảng + sao chép bảng — tạo bảng đi qua đúng `boardService.create`. */
    blueprintService: new BoardBlueprintService({ boards, labels, access, creator: boardService, tasks, taskCreator: taskService }),
    taskService,
    moveService,
    detailService: new TaskDetailService(detailDeps),
    checklistService: new TaskChecklistService(detailDeps),
    attachmentService: new TaskAttachmentService(detailDeps),
    commentService: new TaskCommentService(detailDeps),
    feedService: new TaskFeedService(detailDeps),
    /** p3-03 (P1): theo dõi thẻ (PUT/DELETE watch, danh sách người theo dõi). */
    watchService: new TaskWatchService({ access, directory, watchers }),
    /** p3-03 (P1): sao chép thẻ / chuyển mục checklist thành thẻ — đi qua đúng `taskService.create`. */
    duplicateService: new TaskDuplicateService(detailDeps, taskService),
    convertService: new TaskConvertService(detailDeps, taskService),
    /** p4-04: phụ thuộc giữa thẻ (thêm/xoá/list + kiểm vòng + bộ đếm). */
    dependencyService: new DependencyService({
      access,
      tasks,
      dependencies,
      runner,
      activity: taskDeps.activity,
      emitter,
      directory,
      limits,
    }),
    rescheduleService,
    /** p4-04: job nền `reports/task.reschedule-bulk` (áp lô theo lượt 200 thẻ, idempotent theo `cursor`). */
    rescheduleBatchProcessor,
    /** p4-04: cron TĨNH `reschedule-batch.sweep` — lô treo quá hạn → `FAILED` + nhả `activeKey`. */
    rescheduleBatchSweeper: new RescheduleBatchSweeper({ batches, processor: rescheduleBatchProcessor }),
    /** p4-04: cron `dependency-counts.rebuild` đối soát bộ đếm phụ thuộc. */
    countsRebuildService: new DependencyCountsRebuildService({ dependencies, emitter, directory }),
    /** p4-04 (P1): Gantt chỉ đọc. */
    ganttService: new GanttService({ access, dependencies, timezone: workspaceTimezone, limits }),
    labelService: new LabelService(labels, tasks, directory, access, emitter),
    rebalanceService: new BoardRebalanceService(runner, boards, tasks, emitter),
    statsService: new AdminProjectStatsService(new PrismaProjectStatsRepository()),
    /** p4-05: chấm chéo. `policy`/`effect` đăng ký vào registry `TaskMove` ở `registerProjectsModule()`. */
    review: {
      deps: reviewDeps,
      publisher: reviewPublisher,
      reminders: reviewReminders,
      policy: new ReviewDonePolicy(reviewDeps),
      effect: new ReviewRoundEffect(reviewDeps, reviewRoundService),
      rounds: reviewRoundService,
      config: new ReviewConfigService(reviewDeps),
      query: reviewQuery,
      submit: new ReviewSubmitService(reviewDeps, reviewRoundService, reviewPublisher, reviewReminders, reviewAutoComplete),
      reassign: reviewReassign,
      waive: new ReviewWaiveService(reviewDeps, reviewPublisher, reviewReminders),
      backfill: new ReviewBackfillService(reviewDeps, reviewRoundService, reviewPublisher),
      reconcile: new ReviewReconcileService(reviewDeps, reviewRoundService, reviewReassign, reviewPublisher),
      stats: new ReviewStatsService(new PrismaReviewStatsRepository(), boards, directory),
    },
  };
}

export type ProjectsContainer = ReturnType<typeof createProjectsContainer>;

let cached: ProjectsContainer | null = null;

/** Singleton lười cho job (worker không import routes) — tránh dựng lại repo/service mỗi lần job chạy. */
export function getProjectsContainer(): ProjectsContainer {
  cached ??= createProjectsContainer();
  return cached;
}
