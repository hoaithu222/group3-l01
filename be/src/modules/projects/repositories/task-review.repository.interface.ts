import type {
  MyReviewRow,
  ReviewCancelReason,
  ReviewCreateInput,
  ReviewProgress,
  ReviewUpdate,
  ReviewerLoad,
  RoundCreateInput,
  RoundUpdate,
  TaskReview,
  TaskReviewRound,
} from "../entities/task-review.interface";
import type { TxContext } from "./unit-of-work";

/** Lượt chấm (`TaskReviewRound`). Mọi hàm ghi nhận `tx` để chạy CÙNG transaction với `move`/nộp chấm. */
export interface ITaskReviewRoundRepository {
  /** Trùng `activeKey`/`(taskId, round)` ⇒ ném P2002 (transaction đã abort — caller PHẢI kiểm `findOpen` TRƯỚC, không bắt-và-tiếp-tục). */
  create(input: RoundCreateInput, tx?: TxContext): Promise<TaskReviewRound>;
  findById(id: string, tx?: TxContext): Promise<TaskReviewRound | null>;
  /** Lượt ĐANG MỞ của thẻ (tra bằng `activeKey = task:<taskId>`). */
  findOpen(taskId: string, tx?: TxContext): Promise<TaskReviewRound | null>;
  /** Lượt có `round` lớn nhất của thẻ (đang mở hoặc đã đóng). */
  findLatest(taskId: string, tx?: TxContext): Promise<TaskReviewRound | null>;
  /** Mới → cũ, tối đa `limit`. */
  listByTask(taskId: string, limit: number, tx?: TxContext): Promise<TaskReviewRound[]>;
  /** Lượt OPEN của một bảng theo `id` tăng dần sau `afterId` — tắt chấm chéo xử lý theo lô. */
  listOpenByBoard(boardId: string, afterId: string | null, limit: number, tx?: TxContext): Promise<TaskReviewRound[]>;
  countOpenByBoard(boardId: string, tx?: TxContext): Promise<number>;
  /** Tiến độ lượt mở của nhiều thẻ trong MỘT truy vấn (thẻ không có lượt mở vắng mặt). */
  progressOf(taskIds: string[], tx?: TxContext): Promise<Map<string, ReviewProgress>>;
  /** CAS `where { id, version }`, `version +1`; `null` khi lệch. Đổi sang trạng thái ≠ OPEN ⇒ `activeKey = round:<id>`. */
  updateCas(id: string, expectedVersion: number, set: RoundUpdate, tx?: TxContext): Promise<TaskReviewRound | null>;
  /** Trang lượt OPEN của MỌI bảng theo `id` — đối soát định kỳ. */
  listOpenPage(afterId: string | null, limit: number): Promise<TaskReviewRound[]>;
}

/** Lượt chấm cá nhân (`TaskReview`). */
export interface ITaskReviewRepository {
  createMany(inputs: ReviewCreateInput[], tx?: TxContext): Promise<TaskReview[]>;
  findById(id: string, tx?: TxContext): Promise<TaskReview | null>;
  listByRound(roundId: string, tx?: TxContext): Promise<TaskReview[]>;
  /** Review của nhiều lượt trong MỘT truy vấn (lịch sử). */
  listByRounds(roundIds: string[], tx?: TxContext): Promise<TaskReview[]>;
  /** CAS `where { id, version, status: PENDING }`, `version +1`; `null` khi lệch/không còn PENDING. */
  updatePendingCas(id: string, expectedVersion: number, set: ReviewUpdate, tx?: TxContext): Promise<TaskReview | null>;
  /** Huỷ MỌI review PENDING của lượt (`CANCELLED`); trả các review vừa huỷ (đọc trước khi ghi). */
  cancelPendingOfRound(roundId: string, reason: ReviewCancelReason, tx?: TxContext): Promise<TaskReview[]>;
  /** Tải + lần giao gần nhất (mọi trạng thái) của `userIds` trong workspace; người không có dòng nào vắng mặt (= tải 0, chưa từng). */
  loadsOf(workspaceId: string, userIds: string[], tx?: TxContext): Promise<Map<string, ReviewerLoad>>;
  /** Review PENDING của các người này (`workspaceId` null = mọi workspace), tối đa `limit`. */
  listPendingOf(userIds: string[], workspaceId: string | null, limit: number): Promise<TaskReview[]>;
  /** Trang review PENDING theo `id` tăng dần — đối soát định kỳ. */
  listPendingPage(afterId: string | null, limit: number): Promise<TaskReview[]>;
  /**
   * `GET /me/reviews`: `PENDING` (theo `assignedAt` mới → cũ) hoặc `SUBMITTED` (APPROVED/REQUEST_CHANGES theo `submittedAt`), cursor `(at, id)`.
   * Trả tối đa `limit` hàng kèm lượt tương ứng; CHƯA lọc theo quyền hiện tại (service lọc nhóm đã rời).
   */
  listMine(userId: string, kind: "PENDING" | "SUBMITTED", cursor: { at: Date; id: string } | null, limit: number): Promise<MyReviewRow[]>;
}

/** Số liệu chấm chéo THÔ của một workspace cho admin (service tính trung vị) — chỉ số đếm, không tên/điểm/nhận xét. */
export interface RawReviewStats {
  openRounds: number;
  pendingReviews: number;
  overdue: number;
  roundsInPeriod: number;
  autoApprovedRounds: number;
  waivedRounds: number;
  /** (giao lúc, nộp lúc) của review nộp trong khoảng — tối đa một trần cố định. */
  submitDurations: { assignedAt: Date; submittedAt: Date }[];
  openRoundsByBoard: Map<string, number>;
}

export interface IReviewStatsRepository {
  forWorkspace(workspaceId: string, since: Date, overdueBefore: Date, sampleMax: number): Promise<RawReviewStats>;
}
