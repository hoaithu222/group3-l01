import type { MockAnswer, MockAnswerGrade, MockAnswerInput } from "../entities/mock.interface";
import type { TxHandle } from "./tx";

export interface IMockAnswerRepository {
  /** Ghi đè đáp án theo `(attemptId, itemId)` — duy nhất, đua ghi không nhân bản. */
  upsertMany(attemptId: string, userId: string, answers: readonly MockAnswerInput[], at: Date): Promise<void>;
  /** Xoá đáp án (người học bỏ chọn/xoá chữ). */
  deleteMany(attemptId: string, itemIds: readonly string[]): Promise<void>;
  listByAttempt(attemptId: string, tx?: TxHandle): Promise<MockAnswer[]>;
  countByAttempt(attemptId: string): Promise<number>;
  /** Ghi `correct/partial` lúc chấm (gộp theo giá trị để ít lệnh). */
  markGraded(grades: readonly MockAnswerGrade[], tx?: TxHandle): Promise<void>;
  deleteByUser(userId: string): Promise<number>;
}
