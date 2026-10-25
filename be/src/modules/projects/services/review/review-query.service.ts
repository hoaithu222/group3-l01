import { LIMITS } from "../../../../core/constants/limits";
import type { ResolvedAccess } from "../../../../core/permission";
import type { AuthUser } from "../../../../core/types/express";
import type { CursorResponse } from "../../../../core/utils/response";
import { decodeCursor, encodeCursor } from "../../../../core/utils/cursor";
import type { MyReviewsQueryDto } from "../../dtos";
import type { Board, ColumnKindValue } from "../../entities/board.interface";
import type { Task } from "../../entities/task.interface";
import { parseBoardReview } from "./review-config.schema";
import { presentReview, presentRound, userIdsOf, type ReviewRoundDto, type TaskReviewDto } from "./review.presenter";
import { canSeeResults, visibilityOf, type ReviewViewer } from "./review-visibility";
import type { ReviewDeps } from "./review.deps";

export interface TaskReviewsDto {
  /** Bảng đang bật chấm chéo (client ẩn khối khi tắt và thẻ chưa từng có lượt). */
  enabled: boolean;
  /** Số lượt duyệt cần theo cấu hình hiện tại của bảng (áp cho lượt MỚI). */
  requiredReviews: number;
  /** Lượt mới nhất của thẻ (đang mở hoặc đã đóng). */
  currentRound: ReviewRoundDto | null;
  /** Các lượt cũ hơn, mới → cũ (≤ `LIMITS.review.historyRoundsMax`). */
  history: ReviewRoundDto[];
  /** Review của CHÍNH người xem trong `currentRound`. */
  myReview: TaskReviewDto | null;
  /** SERVER tính — client không tự suy từ vai trò. */
  myPermissions: { submit: boolean; reassign: boolean; waive: boolean };
}

export interface MyReviewItemDto {
  reviewId: string;
  status: "PENDING" | "APPROVED" | "REQUEST_CHANGES";
  assignedAt: string;
  submittedAt: string | null;
  task: { id: string; title: string; boardId: string; boardName: string; workspaceId: string; workspaceName: string; columnKind: ColumnKindValue };
  round: { round: number; approvedCount: number; requiredReviews: number };
}

const NO_PERMISSIONS = { submit: false, reassign: false, waive: false } as const;

/** Đọc chấm chéo: `GET /tasks/:id/reviews` (lọc điểm/nhận xét theo người xem), `TaskDetailDto.reviews`, `GET /me/reviews`. */
export class ReviewQueryService {
  constructor(private readonly d: ReviewDeps) {}

  async forTask(user: AuthUser, taskId: string): Promise<TaskReviewsDto> {
    const { task, board, access } = await this.d.access.task(user, taskId, "workspace.board.read");
    return this.build(task, board, access, user.id);
  }

  /** Dùng lại trong `TaskDetailService` (đã có thẻ/bảng/quyền) — cùng kết quả `GET /tasks/:id/reviews`. */
  async build(task: Task, board: Board, access: ResolvedAccess, userId: string): Promise<TaskReviewsDto> {
    const config = parseBoardReview(board.review);
    const rounds = await this.d.rounds.listByTask(task.id, LIMITS.review.historyRoundsMax + 1);
    if (rounds.length === 0) {
      return { enabled: config.enabled, requiredReviews: config.requiredReviews, currentRound: null, history: [], myReview: null, myPermissions: { ...NO_PERMISSIONS } };
    }
    const reviews = await this.d.reviews.listByRounds(rounds.map((r) => r.id));
    const users = await this.d.directory.userSummaries(userIdsOf(rounds, reviews));
    const viewer: ReviewViewer = { userId, isAdmin: access.actions.has("workspace.board.edit"), isAssignee: task.assigneeIds.includes(userId) };

    const [current, ...older] = rounds;
    const mine = reviews.find((r) => r.roundId === current.id && r.reviewerId === userId) ?? null;
    const currentReviews = reviews.filter((r) => r.roundId === current.id);
    const canSee = canSeeResults(viewer, current, currentReviews);
    const open = current.status === "OPEN" && !board.archivedAt;
    return {
      enabled: config.enabled,
      requiredReviews: config.requiredReviews,
      currentRound: presentRound(current, reviews, users, viewer),
      history: older.map((r) => presentRound(r, reviews, users, viewer)),
      myReview: mine ? presentReview(mine, users, visibilityOf(viewer, canSee, mine)) : null,
      myPermissions: {
        submit: open && mine?.status === "PENDING" && !viewer.isAssignee && access.actions.has("workspace.task.update"),
        reassign: open && viewer.isAdmin && currentReviews.some((r) => r.status === "PENDING"),
        waive: open && viewer.isAdmin,
      },
    };
  }

  /**
   * `GET /me/reviews` — cursor `(at, id)` mới → cũ; bỏ nhóm mà người dùng đã rời/thẻ đã xoá (lọc SAU truy vấn nên một trang có thể ít hơn `limit`,
   * client cứ đi tiếp bằng `nextCursor`).
   */
  async mine(user: AuthUser, query: MyReviewsQueryDto): Promise<CursorResponse<MyReviewItemDto>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.d.reviews.listMine(user.id, query.status, cursor, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    const keyOf = (r: { assignedAt: Date; submittedAt: Date | null }): Date => (query.status === "PENDING" ? r.assignedAt : (r.submittedAt as Date));
    const nextCursor = hasMore && last ? encodeCursor(keyOf(last.review), last.review.id) : null;

    const [member, tasks] = await Promise.all([
      this.d.directory.workspaceIdsWhereMember(user.id, [...new Set(page.map((r) => r.review.workspaceId))]),
      this.d.tasks.findLiveByIds([...new Set(page.map((r) => r.review.taskId))]),
    ]);
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const visible = page.filter((r) => member.has(r.review.workspaceId) && taskById.has(r.review.taskId));
    const [boardNames, workspaceNames] = await Promise.all([
      this.d.directory.boardNames([...new Set(visible.map((r) => r.review.boardId))]),
      this.d.directory.workspaceNames([...new Set(visible.map((r) => r.review.workspaceId))]),
    ]);
    const data = visible.map(({ review, round }): MyReviewItemDto => {
      const task = taskById.get(review.taskId) as Task;
      return {
        reviewId: review.id,
        status: review.status === "PENDING" ? "PENDING" : review.status === "APPROVED" ? "APPROVED" : "REQUEST_CHANGES",
        assignedAt: review.assignedAt.toISOString(),
        submittedAt: review.submittedAt ? review.submittedAt.toISOString() : null,
        task: {
          id: task.id,
          title: task.title,
          boardId: review.boardId,
          boardName: boardNames.get(review.boardId) ?? "",
          workspaceId: review.workspaceId,
          workspaceName: workspaceNames.get(review.workspaceId) ?? "",
          columnKind: task.columnKind,
        },
        round: { round: round.round, approvedCount: round.approvedCount, requiredReviews: round.requiredReviews },
      };
    });
    return { data, meta: { nextCursor, hasMore, limit: query.limit } };
  }
}
