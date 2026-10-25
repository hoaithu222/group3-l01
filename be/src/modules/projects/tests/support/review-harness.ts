/**
 * Bộ dựng dùng chung cho unit test chấm chéo p4-05 (KHÔNG phải test): mở rộng `ServiceHarness` (repository in-memory, quyền THẬT qua
 * `permissionService` + ma trận vai của `workspaces`) bằng repository lượt/review in-memory, các service chấm chéo, và ĐĂNG KÝ chính sách + hiệu ứng vào
 * registry `TaskMove` của harness — nên `moveService.move()` chạy đúng đường production.
 */
import type { AuthUser } from "../../../../core/types/express";
import type { Board } from "../../entities/board.interface";
import type { BoardReviewConfig, TaskReview, TaskReviewRound } from "../../entities/task-review.interface";
import type { Task } from "../../entities/task.interface";
import { InMemoryReviewStatsRepository, InMemoryReviewStore, InMemoryTaskReviewRepository, InMemoryTaskReviewRoundRepository } from "../../repositories/task-review.repository.inmemory";
import { ReviewAutoComplete } from "../../services/review/review-auto-complete";
import { defaultBoardReview } from "../../services/review/review-config.schema";
import { ReviewConfigService } from "../../services/review/review-config.service";
import { FALLBACK_REVIEW_DEFAULTS, type ReviewDefaults } from "../../services/review/review-defaults";
import { ReviewDonePolicy } from "../../services/review/review-done.policy";
import { ReviewNotificationHandler } from "../../services/review/review-notification.handler";
import { ReviewPublisher } from "../../services/review/review-publisher";
import { ReviewQueryService } from "../../services/review/review-query.service";
import { ReviewReassignService } from "../../services/review/review-reassign.service";
import { ReviewReconcileService } from "../../services/review/review-reconcile.service";
import type { IReviewReminders } from "../../services/review/review-reminders";
import { ReviewRoundEffect } from "../../services/review/review-round.effect";
import { ReviewRoundService } from "../../services/review/review-round.service";
import { ReviewBackfillService } from "../../services/review/review-backfill.service";
import { ReviewStatsService } from "../../services/review/review-stats.service";
import { ReviewSubmitService } from "../../services/review/review-submit.service";
import { ReviewWaiveService } from "../../services/review/review-waive.service";
import type { ReviewDeps } from "../../services/review/review.deps";
import { ServiceHarness, type Role } from "./service-harness";
import type { NotifyInput } from "../../../notifications/public";

/** Ghi lại lịch hẹn/huỷ nhắc để khẳng định. */
export class FakeReminders implements IReviewReminders {
  readonly scheduled: { reviewId: string; hours: number; runAt: Date }[] = [];
  readonly cancelled: { reviewIds: readonly string[]; hours: readonly number[] }[] = [];
  schedule(reviewId: string, hours: number, runAt: Date): Promise<void> {
    this.scheduled.push({ reviewId, hours, runAt });
    return Promise.resolve();
  }
  cancel(reviewIds: readonly string[], hours: readonly number[]): Promise<void> {
    this.cancelled.push({ reviewIds, hours });
    return Promise.resolve();
  }
}

export class ReviewHarness extends ServiceHarness {
  readonly store = new InMemoryReviewStore();
  readonly roundRepo = new InMemoryTaskReviewRoundRepository(this.store);
  readonly reviewRepo = new InMemoryTaskReviewRepository(this.store);
  readonly statsRepo = new InMemoryReviewStatsRepository(this.store);
  readonly reminders = new FakeReminders();
  defaults: ReviewDefaults = { ...FALLBACK_REVIEW_DEFAULTS };
  readonly notifications: NotifyInput[] = [];

  readonly reviewDeps: ReviewDeps = {
    rounds: this.roundRepo,
    reviews: this.reviewRepo,
    tasks: this.tasks,
    boards: this.boards,
    directory: this.directory,
    access: this.access,
    runner: this.runner,
    activity: this.activityWriter,
    outbox: this.outbox,
    audit: this.audit,
    emitter: this.emitter,
    rebalance: this.rebalance,
    defaults: { load: () => Promise.resolve(this.defaults) },
    clock: this.clock,
  };
  readonly publisher = new ReviewPublisher(this.reviewDeps);
  readonly roundService = new ReviewRoundService(this.reviewDeps);
  /** P1 `autoCompleteOnApproval`: dùng CHÍNH `moveService` của harness (registry policy/effect như production). */
  readonly autoComplete = new ReviewAutoComplete(this.reviewDeps, this.moveService);
  readonly reassignService = new ReviewReassignService(this.reviewDeps, this.roundService, this.publisher, this.reminders, this.autoComplete);
  readonly submitService = new ReviewSubmitService(this.reviewDeps, this.roundService, this.publisher, this.reminders, this.autoComplete);
  readonly waiveService = new ReviewWaiveService(this.reviewDeps, this.publisher, this.reminders);
  readonly configService = new ReviewConfigService(this.reviewDeps);
  readonly queryService = new ReviewQueryService(this.reviewDeps);
  readonly reconcileService = new ReviewReconcileService(this.reviewDeps, this.roundService, this.reassignService, this.publisher);
  readonly backfillService = new ReviewBackfillService(this.reviewDeps, this.roundService, this.publisher);
  readonly statsService = new ReviewStatsService(this.statsRepo, this.boards, this.directory);
  readonly notificationHandler = new ReviewNotificationHandler({
    rounds: this.roundRepo,
    reviews: this.reviewRepo,
    tasks: this.tasks,
    directory: this.directory,
    notify: (input) => {
      this.notifications.push(input);
      return Promise.resolve();
    },
    publisher: this.publisher,
    reminders: this.reminders,
    defaults: this.reviewDeps.defaults,
    now: this.clock,
  });

  constructor() {
    super();
    this.registry.registerPolicy(new ReviewDonePolicy(this.reviewDeps));
    this.registry.registerEffect(new ReviewRoundEffect(this.reviewDeps, this.roundService));
    this.directory.workspaceNameMap.set(this.workspaceId, "Nhóm test");
  }

  override addUser(role: Role): AuthUser {
    const user = super.addUser(role);
    if (role === "OWNER" || role === "ADMIN") this.directory.admins.add(user.id);
    return user;
  }

  /** Bảng mới (cột To do / In progress / Review / Done) bật chấm chéo với `patch` (mặc định 2 lượt duyệt, không rubric). */
  async reviewBoard(owner: AuthUser, patch: Partial<BoardReviewConfig> = {}): Promise<Board> {
    const board = await this.createBoard(owner);
    this.setBoardReview(board.id, { ...defaultBoardReview(2, true), ...patch });
    return (await this.boards.findById(board.id)) as Board;
  }

  setBoardReview(boardId: string, review: BoardReviewConfig): void {
    const board = this.boards.boards.get(boardId);
    if (!board) throw new Error("board không tồn tại trong kho");
    board.review = structuredClone(review);
  }

  /** Kéo thẻ sang cột `kind` qua `TaskMoveService` THẬT (policy + effect chạy). */
  async moveTo(user: AuthUser, board: Board, task: Task, kind: Task["columnKind"]): Promise<Task> {
    const fresh = (await this.tasks.findById(task.id)) as Task;
    await this.moveService.move(user, task.id, {
      columnId: this.columnId(board, kind),
      afterTaskId: null,
      beforeTaskId: null,
      expectedVersion: fresh.version,
      clientMutationId: `mutation-${task.id.slice(-8)}-${fresh.version}`,
    });
    return (await this.tasks.findById(task.id)) as Task;
  }

  async currentRound(taskId: string): Promise<TaskReviewRound | null> {
    return this.roundRepo.findLatest(taskId);
  }

  async reviewsOf(round: TaskReviewRound): Promise<TaskReview[]> {
    return this.reviewRepo.listByRound(round.id);
  }
}
