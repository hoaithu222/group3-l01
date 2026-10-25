import type { MockAttempt, MockAttemptCreateInput, MockEventPatch, MockFinalizePatch } from "../entities/mock.interface";
import type { TxHandle } from "./tx";

export interface MockAttemptListParams {
  userId: string;
  setId?: string;
  /** Lượt bắt đầu SAU `(startedAt, id)` này theo thứ tự mới → cũ. */
  after?: { at: Date; id: string };
  limit: number;
}

export interface IMockAttemptRepository {
  /** `activeKey` trùng (đã có lượt dở của bộ) → ném `UniqueViolationError`. */
  create(input: MockAttemptCreateInput, tx?: TxHandle): Promise<MockAttempt>;
  findById(id: string, tx?: TxHandle): Promise<MockAttempt | null>;
  /** Lượt `IN_PROGRESS` của `(người, bộ)` — qua `activeKey`. */
  findActive(userId: string, setId: string): Promise<MockAttempt | null>;
  /** CAS `IN_PROGRESS → SUBMITTED|EXPIRED` (+ `activeKey = done:<id>`, `version + 1`). `null` = đã kết thúc (không đổi gì). */
  finalizeIf(id: string, patch: MockFinalizePatch, tx?: TxHandle): Promise<MockAttempt | null>;
  /** Đặt `answeredCount` (chỉ khi còn `IN_PROGRESS`). */
  setAnsweredCount(id: string, count: number): Promise<void>;
  /** CAS theo `eventCount` đọc được (+1) — `false` = bị ghi chen, caller đọc lại rồi thử lại. */
  applyEvent(id: string, expectedEventCount: number, patch: MockEventPatch): Promise<boolean>;
  /** Số lượt bắt đầu từ `since` của `(người, bộ)` — giới hạn `attemptsPerSetPerDayMax`. */
  countStartedSince(userId: string, setId: string, since: Date): Promise<number>;
  list(params: MockAttemptListParams): Promise<MockAttempt[]>;
  /** Ẩn danh hoá tài khoản: xoá mọi lượt thi của người dùng. */
  deleteByUser(userId: string): Promise<number>;
}
