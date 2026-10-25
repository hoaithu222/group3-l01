import type { WellbeingLevel } from "../domain/burnout-rules";
import type { AckAction, AssessmentScoreInput, BurnoutAssessmentEntity } from "../entities/burnout.interface";
import type { TxHandle } from "./tx";

/** Mọi truy vấn đều THEO CHỦ SỞ HỮU (`userId`) — không có hàm nào liệt kê đánh giá của người khác. */
export interface IBurnoutAssessmentRepository {
  /** Đánh giá của CHÍNH `userId`; `null` khi không có hoặc thuộc người khác (không phân biệt — chống dò id). */
  findOwned(id: string, userId: string): Promise<BurnoutAssessmentEntity | null>;

  findByDate(userId: string, date: string): Promise<BurnoutAssessmentEntity | null>;

  /**
   * Tạo hoặc cập nhật ĐIỂM của `(userId, date)`; bản đã có GIỮ NGUYÊN `alerted`/`ackAction` (chấm lại cùng ngày — job chạy lại, admin đổi luật — không được "xoá" dấu đã cảnh báo rồi cảnh báo lần nữa).
   */
  upsertScore(input: AssessmentScoreInput): Promise<BurnoutAssessmentEntity>;

  /** Đánh dấu đã cảnh báo; `false` nếu đã đánh dấu từ trước (một đánh giá chỉ cảnh báo một lần). */
  markAlerted(id: string, now: Date, tx?: TxHandle): Promise<boolean>;

  /** Ghi ack lần ĐẦU (`ackAction` còn trống, đã cảnh báo); `false` = không có gì để ghi (đã ack, hoặc chưa cảnh báo). */
  acknowledge(id: string, userId: string, action: AckAction, now: Date, tx?: TxHandle): Promise<boolean>;

  /** Các ngày có `date ≥ fromDate`, cũ → mới. */
  listSince(userId: string, fromDate: string): Promise<BurnoutAssessmentEntity[]>;

  latest(userId: string): Promise<BurnoutAssessmentEntity | null>;

  deleteByUser(userId: string, tx?: TxHandle): Promise<number>;

  deleteCreatedBefore(cutoff: Date): Promise<number>;

  /**
   * P1 — `GET /workspaces/:id/wellbeing/indicators`: đánh giá MỚI NHẤT của mỗi người trong `userIds` với `date ≥ sinceDate`, CHỈ `level` + `date`
   * (KHÔNG `riskScore`/`factors`/số phút — be.md §2 "Chia sẻ trưởng nhóm"). Người không có đánh giá đủ gần vắng khỏi map.
   */
  latestForUsers(userIds: readonly string[], sinceDate: string): Promise<Map<string, { level: WellbeingLevel; date: string }>>;
}
