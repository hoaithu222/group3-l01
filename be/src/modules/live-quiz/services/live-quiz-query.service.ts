import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { CursorResponse } from "../../../core/utils/response";
import type { LiveQuizSession } from "../entities/live-quiz.interface";
import { quizErrors } from "../live-quiz.errors";
import type { LiveQuizDeps } from "./live-quiz.types";

export interface LiveQuizResultsDto {
  sessionId: string;
  setId: string;
  setTitle: string;
  status: string;
  /** Số câu của phiên. */
  total: number;
  persisted: boolean;
  results: object[];
}

/** Đọc kết quả bền: của phiên (host/người chơi), lịch sử của tôi, và metadata cho admin. */
export class LiveQuizQueryService {
  constructor(private readonly d: LiveQuizDeps) {}

  /**
   * `GET /live-quiz/:id/results` — bảng kết quả bền (sau `live-quiz.persist`); chỉ host hoặc người ĐÃ chơi xem được. Chưa ghi xong thì trả
   * `persisted: false` + bảng rỗng (client thăm dò lại) — cả với người chơi (họ chưa có hàng kết quả nhưng còn trong phòng ở Redis);
   * người ngoài phiên → 404 trung tính.
   */
  async results(user: AuthUser, sessionId: string): Promise<LiveQuizResultsDto> {
    const session = await this.d.repo.findById(sessionId);
    if (!session) throw quizErrors.notFound();
    if (session.hostId !== user.id && !(await this.d.repo.findResult(sessionId, user.id))) {
      const waiting = session.resultsPersistedAt === null && (await this.d.store.hasPlayer(sessionId, user.id));
      if (!waiting) throw quizErrors.notFound();
    }
    const rows = await this.d.repo.listResults(sessionId);
    return {
      sessionId,
      setId: session.setId,
      setTitle: session.setTitle,
      status: session.status,
      total: session.questionOrder.length,
      persisted: session.resultsPersistedAt !== null,
      results: rows.map((r) => ({ userId: r.userId, nickname: r.nickname, score: r.score, correct: r.correct, answered: r.answered, rank: r.rank, answers: r.answers })),
    };
  }

  /** `GET /me/live-quiz/history` — kết quả của chính mình, mới → cũ, phân trang cursor `(createdAt, id)`. */
  async history(user: AuthUser, q: { cursor?: string; limit: number }): Promise<CursorResponse<object>> {
    const after = q.cursor ? decodeCursor(q.cursor) : null;
    const rows = await this.d.repo.listResultsByUser(user.id, after, q.limit + 1);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const sessions = new Map((await this.d.repo.findByIds(page.map((r) => r.sessionId))).map((x) => [x.id, x]));
    const last = page.at(-1);
    return {
      data: page.map((r) => {
        const sx = sessions.get(r.sessionId);
        return {
          sessionId: r.sessionId,
          setId: sx?.setId ?? null,
          setTitle: sx?.setTitle ?? null,
          endedAt: sx?.endedAt ?? null,
          total: sx?.questionOrder.length ?? r.answers.length,
          score: r.score,
          correct: r.correct,
          answered: r.answered,
          rank: r.rank,
          createdAt: r.createdAt,
        };
      }),
      meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore, limit: q.limit },
    };
  }

  /** `GET /admin/live-quiz/sessions` — metadata phân trang (không PIN, không đáp án). */
  async adminList(p: { status?: LiveQuizSession["status"]; page: number; limit: number }): Promise<{ items: object[]; total: number }> {
    const { items, total } = await this.d.repo.adminList(p);
    return { items: items.map(adminView), total };
  }

  /** `GET /admin/live-quiz/sessions/:id` — metadata + bảng kết quả bền (nếu đã lưu). */
  async adminGet(sessionId: string): Promise<object> {
    const session = await this.d.repo.findById(sessionId);
    if (!session) throw quizErrors.notFound();
    const rows = await this.d.repo.listResults(sessionId);
    return {
      ...adminView(session),
      results: rows.map((r) => ({ userId: r.userId, nickname: r.nickname, score: r.score, correct: r.correct, answered: r.answered, rank: r.rank })),
    };
  }
}

function adminView(s: LiveQuizSession): object {
  return {
    id: s.id,
    status: s.status,
    endReason: s.endReason,
    setId: s.setId,
    setTitle: s.setTitle,
    workspaceId: s.workspaceId,
    hostId: s.hostId,
    total: s.questionOrder.length,
    playersCount: s.playersCount,
    currentIndex: s.currentIndex,
    autoAdvance: s.autoAdvance,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    resultsPersistedAt: s.resultsPersistedAt,
    createdAt: s.createdAt,
    version: s.version,
  };
}
