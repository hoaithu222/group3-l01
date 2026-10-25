import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { logger } from "../../../infrastructure/logger";
import type { ColumnKindValue } from "../entities/board.interface";
import type { TaskCardDto } from "../services/task.presenter";
import type { TaskActivityDto, TaskCommentDto } from "../services/task-feed.presenter";

export interface BoardUpdatedPayload {
  boardId: string;
  version: number;
  /** Job rebalance vừa nén khoá cột này → client refetch cột đó. */
  rebalancedColumnId?: string;
  /** Nhãn của bảng đổi → client refetch danh sách nhãn. */
  labelsChanged?: boolean;
}

export interface TaskMovedPayload {
  id: string;
  boardId: string;
  fromColumnId: string;
  columnId: string;
  columnKind: ColumnKindValue;
  position: string;
  version: number;
  completedAt: string | null;
  /** `null` = hệ thống (p4-05: Yêu cầu sửa đưa thẻ về IN_PROGRESS). */
  actorId: string | null;
  clientMutationId: string | null;
}

/**
 * (p4-05) `task:review-updated` — mở/đóng/huỷ lượt chấm, nộp chấm, giao lại, miễn. KHÔNG có điểm/nhận xét (room `board:` gồm cả người
 * không được xem kết quả): client tải lại `GET /tasks/:id/reviews`, kết quả đã lọc theo người xem.
 */
export interface TaskReviewUpdatedPayload {
  taskId: string;
  boardId: string;
  roundId: string;
  round: number;
  status: "OPEN" | "APPROVED" | "CHANGES_REQUESTED" | "CANCELLED" | "WAIVED";
  approvedCount: number;
  requiredReviews: number;
  assignedCount: number;
  reviewerIds: string[];
}

export interface TaskChangedPayload {
  task: TaskCardDto;
  actorId: string | null;
  clientMutationId?: string | null;
  /** (p3-03) Tên trường vừa đổi — app dựa vào để biết có phải tải lại chi tiết không (`checklist`, `description`, …). */
  changed?: string[];
  /** (p3-03) `task:created` do KHÔI PHỤC thẻ đã xoá mềm. */
  restored?: boolean;
}

/**
 * (p3-03) `task:activity`: một bản ghi nhật ký HOẶC `{ type: "COMMENT", comment }` (bình luận mới/đã sửa). Room `board:`
 * chỉ gồm thành viên (GUEST không vào được) nên được phép mang nội dung bình luận.
 */
export interface TaskActivityPayload {
  taskId: string;
  activity: TaskActivityDto | { type: "COMMENT"; comment: TaskCommentDto };
}

/**
 * (p4-04) `board:rescheduled`: dời lịch > `rescheduleEmitEachMax` thẻ (thay `task:updated` từng thẻ) hoặc MỖI lượt của lô nền.
 * Đồng bộ → `rescheduleId`; lô nền → `batchId` (+ `rescheduleId` = `batchId`). `final` chỉ `true` ở lượt cuối.
 */
export interface BoardRescheduledPayload {
  boardId: string;
  rescheduleId?: string;
  batchId?: string;
  taskIds: string[];
  count: number;
  final: boolean;
}

/** Cổng phát realtime vào room `board:{id}` — bản socket thật bên dưới, bản giả cho unit test. */
export interface IBoardEmitter {
  boardUpdated(boardId: string, payload: BoardUpdatedPayload): void;
  taskCreated(boardId: string, payload: TaskChangedPayload): void;
  taskUpdated(boardId: string, payload: TaskChangedPayload): void;
  taskMoved(boardId: string, payload: TaskMovedPayload): void;
  taskDeleted(boardId: string, payload: { id: string; actorId: string | null }): void;
  taskActivity(boardId: string, payload: TaskActivityPayload): void;
  boardRescheduled(boardId: string, payload: BoardRescheduledPayload): void;
  taskReviewUpdated(boardId: string, payload: TaskReviewUpdatedPayload): void;
}

/**
 * Phát SAU khi transaction đã commit. Best-effort: lỗi emit (worker riêng đi qua cầu nối Redis p0-03; unit test/script chưa có đường nào
 * tới Socket.IO) KHÔNG được làm hỏng request đã ghi thành công — client vẫn khôi phục nhờ refetch khi reconnect.
 */
export class SocketBoardEmitter implements IBoardEmitter {
  boardUpdated(boardId: string, payload: BoardUpdatedPayload): void {
    this.emit(boardId, SocketEvent.BOARD_UPDATED, payload);
  }
  taskCreated(boardId: string, payload: TaskChangedPayload): void {
    this.emit(boardId, SocketEvent.TASK_CREATED, payload);
  }
  taskUpdated(boardId: string, payload: TaskChangedPayload): void {
    this.emit(boardId, SocketEvent.TASK_UPDATED, payload);
  }
  taskMoved(boardId: string, payload: TaskMovedPayload): void {
    this.emit(boardId, SocketEvent.TASK_MOVED, payload);
  }
  taskDeleted(boardId: string, payload: { id: string; actorId: string | null }): void {
    this.emit(boardId, SocketEvent.TASK_DELETED, payload);
  }
  taskActivity(boardId: string, payload: TaskActivityPayload): void {
    this.emit(boardId, SocketEvent.TASK_ACTIVITY, payload);
  }

  boardRescheduled(boardId: string, payload: BoardRescheduledPayload): void {
    this.emit(boardId, SocketEvent.BOARD_RESCHEDULED, payload);
  }

  taskReviewUpdated(boardId: string, payload: TaskReviewUpdatedPayload): void {
    this.emit(boardId, SocketEvent.TASK_REVIEW_UPDATED, payload);
  }

  private emit(boardId: string, event: SocketEvent, payload: object): void {
    try {
      emitToRoom(ROOM.board(boardId), event, payload);
    } catch (err) {
      logger.warn("[projects] emit realtime thất bại", { boardId, event, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
