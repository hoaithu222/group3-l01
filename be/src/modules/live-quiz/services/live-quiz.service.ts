import type { AuthUser } from "../../../core/types/express";
import type { CursorResponse } from "../../../core/utils/response";
import type { CreateSessionDto, JoinDto } from "../dtos";
import type { QuizCommand } from "../entities/live-quiz.commands";
import type { QuizSnapshot } from "../entities/live-quiz.events";
import type { LiveQuizSession } from "../entities/live-quiz.interface";
import { LiveQuizFinishService } from "./live-quiz-finish.service";
import { LiveQuizFlowService } from "./live-quiz-flow.service";
import { LiveQuizHostPresenceService } from "./live-quiz-host-presence.service";
import { LiveQuizPersistService } from "./live-quiz-persist.service";
import { LiveQuizQueryService, type LiveQuizResultsDto } from "./live-quiz-query.service";
import { LiveQuizSessionService } from "./live-quiz-session.service";
import type { LiveQuizDeps } from "./live-quiz.types";

export type { IQuizAudit, LiveQuizDeps } from "./live-quiz.types";
export { LIVE_QUIZ_AUDIT, LIVE_QUIZ_PASS_PCT, LIVE_QUIZ_PERSIST, QUIZ_SCORED_OUTBOX, livePersistDedupeKey } from "./live-quiz.types";

/**
 * Điều phối phiên live quiz (p5-01 be.md §5) — mặt tiền cho controller/socket/job, việc thật nằm ở các service theo trách nhiệm:
 * `session` (tạo/vào/kick) · `flow` (mở câu, nhận đáp án, công bố) · `finish` (đóng phiên, cron, admin) · `hostPresence` (host mất kết nối) ·
 * `persist` (ghi kết quả bền + XP) · `query` (đọc kết quả/lịch sử/admin). Redis (`ILiveQuizStore`) là nguồn sự thật khi đang chơi; Mongo
 * giữ metadata + bản sao `version`. Lệnh hẹn giờ đi qua `IQuizScheduler` (`QuizCommandBus`), thực thi bằng `runCommand`.
 */
export class LiveQuizService {
  private readonly session: LiveQuizSessionService;
  private readonly flow: LiveQuizFlowService;
  private readonly finisher: LiveQuizFinishService;
  private readonly host: LiveQuizHostPresenceService;
  private readonly persist: LiveQuizPersistService;
  private readonly query: LiveQuizQueryService;

  constructor(d: LiveQuizDeps) {
    const now = d.now ?? Date.now;
    this.session = new LiveQuizSessionService(d, now);
    this.finisher = new LiveQuizFinishService(d, now);
    this.flow = new LiveQuizFlowService(d, this.finisher, now);
    this.host = new LiveQuizHostPresenceService(d, this.finisher, now);
    this.persist = new LiveQuizPersistService(d, now);
    this.query = new LiveQuizQueryService(d);
  }

  create(user: AuthUser, dto: CreateSessionDto): Promise<{ session: LiveQuizSession; pin: string }> {
    return this.session.create(user, dto);
  }

  join(user: AuthUser, dto: JoinDto): Promise<{ sessionId: string; snapshot: QuizSnapshot }> {
    return this.session.join(user, dto);
  }

  get(user: AuthUser, sessionId: string): Promise<QuizSnapshot> {
    return this.session.get(user, sessionId);
  }

  isParticipant(userId: string, sessionId: string): Promise<boolean> {
    return this.session.isParticipant(userId, sessionId);
  }

  kick(user: AuthUser, sessionId: string, userId: string): Promise<void> {
    return this.session.kick(user, sessionId, userId);
  }

  advance(user: AuthUser, sessionId: string, mode: "start" | "next", expectedVersion: number): Promise<QuizSnapshot> {
    return this.flow.advance(user, sessionId, mode, expectedVersion);
  }

  answer(user: AuthUser, sessionId: string, index: number, choice: number): Promise<{ accepted: true; answered: number; players: number }> {
    return this.flow.answer(user, sessionId, index, choice);
  }

  autoAdvance(sessionId: string, index: number): Promise<boolean> {
    return this.flow.autoAdvance(sessionId, index);
  }

  revealQuestion(sessionId: string, index: number): Promise<boolean> {
    return this.flow.revealQuestion(sessionId, index);
  }

  hostDisconnected(userId: string, sessionId: string, hostStillConnected: () => Promise<boolean>): Promise<void> {
    return this.host.hostDisconnected(userId, sessionId, hostStillConnected);
  }

  hostReturned(userId: string, sessionId: string): Promise<void> {
    return this.host.hostReturned(userId, sessionId);
  }

  hostTimeout(sessionId: string, lastSeenMs: number): Promise<boolean> {
    return this.host.hostTimeout(sessionId, lastSeenMs);
  }

  /** Bộ thực thi của `QuizCommandBus` (timer trong tiến trình, pub/sub từ worker, job ở tiến trình có Socket.IO). Mọi lệnh idempotent. */
  async runCommand(cmd: QuizCommand): Promise<void> {
    if (cmd.type === "close") await this.flow.revealQuestion(cmd.sessionId, cmd.index);
    else if (cmd.type === "advance") await this.flow.autoAdvance(cmd.sessionId, cmd.index);
    else await this.host.hostTimeout(cmd.sessionId, cmd.lastSeenMs);
  }

  end(user: AuthUser, sessionId: string, expectedVersion: number, cancel: boolean): Promise<{ status: string }> {
    return this.finisher.end(user, sessionId, expectedVersion, cancel);
  }

  expireStale(limit?: number): Promise<number> {
    return this.finisher.expireStale(limit);
  }

  adminEnd(actor: AuthUser, sessionId: string, reason: string): Promise<{ status: string }> {
    return this.finisher.adminEnd(actor, sessionId, reason);
  }

  persistResults(sessionId: string): Promise<number> {
    return this.persist.persistResults(sessionId);
  }

  results(user: AuthUser, sessionId: string): Promise<LiveQuizResultsDto> {
    return this.query.results(user, sessionId);
  }

  history(user: AuthUser, q: { cursor?: string; limit: number }): Promise<CursorResponse<object>> {
    return this.query.history(user, q);
  }

  adminList(p: { status?: LiveQuizSession["status"]; page: number; limit: number }): Promise<{ items: object[]; total: number }> {
    return this.query.adminList(p);
  }

  adminGet(sessionId: string): Promise<object> {
    return this.query.adminGet(sessionId);
  }
}
