import type { StudyContentReader } from "../../study/public";
import type { IQuizScheduler } from "../entities/live-quiz.commands";
import type { IQuizEmitter } from "../realtime/live-quiz.emitter";
import type { IQuizHostPresence } from "../realtime/live-quiz.presence";
import type { ILiveQuizStore } from "../redis/live-quiz.store.types";
import type { ILiveQuizRepository } from "../repositories/live-quiz.repository.interface";
import type { IQuizUserDirectory, IQuizWorkspaceAccess } from "../repositories/ports";
import type { IQuizOutbox, ITxRunner } from "../repositories/tx";

export interface IQuizAudit {
  record(input: { actorId: string; actorRole?: string; action: string; targetType: string; targetId: string; workspaceId?: string; reason?: string; metadata?: Record<string, unknown> }): Promise<void>;
}

export interface LiveQuizDeps {
  repo: ILiveQuizRepository;
  store: ILiveQuizStore;
  content: Pick<StudyContentReader, "getViewableSet" | "listGradableItems">;
  users: IQuizUserDirectory;
  workspaces: IQuizWorkspaceAccess;
  emitter: IQuizEmitter;
  /** Transaction + outbox cho `live-quiz.persist` (be.md §5 end). Thiếu (test đơn vị cũ) → chỉ đóng phiên, không ghi outbox. */
  tx?: ITxRunner;
  outbox?: IQuizOutbox;
  /** Hẹn giờ lệnh (`quiz.question-deadline`/`quiz.auto-advance`/`quiz.host-timeout`) — thiếu → không hẹn giờ (test không cần). */
  scheduler?: IQuizScheduler;
  /** Audit thao tác admin (`live-quiz.admin-end`) — bản mặc định bọc `AuditService` (container); thiếu → không ghi. */
  audit?: IQuizAudit;
  /** Kiểm host còn socket trong room lúc QUYẾT ĐỊNH `host-timeout` (chạy ở API/`all`); thiếu → coi như host đã rời. */
  presence?: IQuizHostPresence;
  now?: () => number;
}

export const LIVE_QUIZ_AUDIT = { adminEnd: "live-quiz.admin-end" } as const;

/** XP (p4-03): outbox `gamification/xp.consume` cho MỖI người chơi, dedupeKey `eventKeys.quizScored("LIVE", sessionId, userId)` → idempotent theo (sessionId, userId). */
export const QUIZ_SCORED_OUTBOX = { queue: "gamification", jobName: "xp.consume" } as const;
/** Ngưỡng "đạt" của live quiz (tỉ lệ câu đúng, %) → thêm nguồn `QUIZ_PASSED`. */
export const LIVE_QUIZ_PASS_PCT = 50;

/** Outbox `live-quiz.persist` (be.md §7) — relay đổi `:` thành `_` khi làm jobId. */
export const LIVE_QUIZ_PERSIST = { queue: "reports", jobName: "live-quiz.persist" } as const;
export const livePersistDedupeKey = (sessionId: string): string => `live-quiz.persist:quiz:${sessionId}`;

/** Phiên còn mở — trạng thái được phép đóng. */
export const OPEN_STATUSES = ["WAITING", "IN_PROGRESS"] as const;
