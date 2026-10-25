import type {
  LiveQuizEndReasonValue,
  LiveQuizResult,
  LiveQuizResultCreateInput,
  LiveQuizSession,
  LiveQuizSessionCreateInput,
  LiveQuizStatusValue,
} from "../entities/live-quiz.interface";
import type { TxHandle } from "./tx";

/** Bản sao tiến trình phiên từ Redis (nguồn sự thật khi đang chơi) sang Mongo — chỉ áp khi `version` MỚI hơn bản đang lưu. */
export interface SessionProgressMirror {
  version: number;
  status: LiveQuizStatusValue;
  currentIndex: number;
  questionStartedAt: Date | null;
  deadlineAt: Date | null;
  startedAt?: Date;
}

export interface SessionCloseInput {
  status: "FINISHED" | "CANCELLED";
  endReason: LiveQuizEndReasonValue;
  endedAt: Date;
  version: number;
  playersCount: number;
}

export interface AdminSessionListParams {
  status?: LiveQuizStatusValue;
  page: number;
  limit: number;
}

export interface ILiveQuizRepository {
  /** Ghi `null` TƯỜNG MINH cho mọi trường sau này lọc bằng `{ field: null }` (`resultsPersistedAt`, …). */
  create(input: LiveQuizSessionCreateInput): Promise<LiveQuizSession>;
  findById(id: string): Promise<LiveQuizSession | null>;
  mirrorProgress(id: string, m: SessionProgressMirror): Promise<void>;
  /** CAS: chỉ đóng phiên còn WAITING/IN_PROGRESS. `true` = lời gọi này đóng được (caller mới ghi outbox). */
  closeIfOpen(id: string, input: SessionCloseInput, tx?: TxHandle): Promise<boolean>;
  /** CAS `resultsPersistedAt` chưa có → đặt. `true` = lời gọi này thắng (caller mới ghi kết quả). Hai lời gọi song song → một thắng. */
  markPersistedIf(id: string, at: Date, tx?: TxHandle): Promise<boolean>;
  createResults(rows: LiveQuizResultCreateInput[], tx?: TxHandle): Promise<void>;
  listResults(sessionId: string): Promise<LiveQuizResult[]>;
  findResult(sessionId: string, userId: string): Promise<LiveQuizResult | null>;
  /** Lịch sử của một người: mới → cũ theo `(createdAt, id)`. */
  listResultsByUser(userId: string, after: { at: Date; id: string } | null, limit: number): Promise<LiveQuizResult[]>;
  findByIds(ids: string[]): Promise<LiveQuizSession[]>;
  /** Phiên treo: WAITING quá `waitingBefore` hoặc IN_PROGRESS không cập nhật kể từ `inProgressBefore`. */
  findStale(waitingBefore: Date, inProgressBefore: Date, limit: number): Promise<LiveQuizSession[]>;
  adminList(p: AdminSessionListParams): Promise<{ items: LiveQuizSession[]; total: number }>;
}
