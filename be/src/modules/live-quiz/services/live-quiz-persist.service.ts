import { LIMITS } from "../../../core/constants/limits";
import type { OutboxEventInput } from "../../../infrastructure/queue";
import { DOMAIN_EVENTS, eventKeys } from "../../../shared/events/domain-events";
import type { LiveQuizResultCreateInput, QuizAnswerRecord } from "../entities/live-quiz.interface";
import { computePoints, scorePercent } from "./live-quiz-scoring";
import { LIVE_QUIZ_PASS_PCT, QUIZ_SCORED_OUTBOX, type LiveQuizDeps } from "./live-quiz.types";

/** Consumer outbox `live-quiz.persist` (be.md §5): Redis (bảng điểm + đáp án từng câu) → `LiveQuizResult` bền + XP `quiz.scored`. */
export class LiveQuizPersistService {
  constructor(
    private readonly d: LiveQuizDeps,
    private readonly now: () => number
  ) {}

  /**
   * Idempotent: CAS `resultsPersistedAt` (null → now) trong CÙNG transaction với `createResults` + outbox XP — job chạy lại/hai worker song
   * song chỉ một bên ghi; crash trước commit → hoàn tác cả ba, lần chạy lại ghi đủ. Trả số hàng đã ghi (0 = đã lưu trước đó / phiên không còn,
   * -1 = dữ liệu nóng Redis đã hết hạn nên KHÔNG đánh dấu persisted với bảng rỗng).
   */
  async persistResults(sessionId: string): Promise<number> {
    const tx = this.d.tx;
    if (!tx) throw new Error("LiveQuizService.persistResults cần tx runner");
    const session = await this.d.repo.findById(sessionId);
    if (!session || session.resultsPersistedAt) return 0;
    if (!(await this.d.store.getMeta(sessionId))) return -1;
    const [players, scores] = await Promise.all([this.d.store.players(sessionId), this.d.store.scores(sessionId)]);
    const nickname = new Map(players.map((p) => [p.userId, p.nickname]));
    const total = session.questionOrder.length;
    const perQuestion = await Promise.all(
      Array.from({ length: total }, async (_, i) => {
        const [answers, correct, question] = await Promise.all([this.d.store.answers(sessionId, i), this.d.store.correctOf(sessionId, i), this.d.store.question(sessionId, i)]);
        return { answers, correctIndex: correct?.correctIndex ?? -1, itemId: question?.itemId ?? session.questionOrder[i] ?? "" };
      })
    );
    const rows: LiveQuizResultCreateInput[] = scores.map((s) => {
      const records: QuizAnswerRecord[] = perQuestion.map((q, index) => {
        const a = q.answers.get(s.userId);
        if (!a) return { index, itemId: q.itemId, choice: null, correct: false, ms: null, points: 0 };
        const ok = a.choice === q.correctIndex;
        return { index, itemId: q.itemId, choice: a.choice, correct: ok, ms: a.ms, points: computePoints(ok, a.ms, session.secondsPerQuestion, session.scoring) };
      });
      return {
        sessionId,
        userId: s.userId,
        nickname: nickname.get(s.userId) ?? null,
        score: s.score,
        correct: records.filter((r) => r.correct).length,
        answered: records.filter((r) => r.choice !== null).length,
        rank: s.rank,
        answers: records,
      };
    });
    const scored = this.quizScoredEvents(session.id, session.setId, total, session.endedAt ?? new Date(this.now()), rows);
    const written = await tx.run(async (h) => {
      if (!(await this.d.repo.markPersistedIf(sessionId, new Date(this.now()), h))) return -1;
      if (rows.length > 0) await this.d.repo.createResults(rows, h);
      // XP (p4-03): CÙNG transaction với CAS `resultsPersistedAt` → chỉ lần ghi thắng mới phát; dedupeKey theo (sessionId, userId).
      if (scored.length > 0) await this.d.outbox?.addMany(h, scored);
      return rows.length;
    });
    if (written < 0) return 0;
    await this.d.store.expireAll(sessionId, total, LIMITS.liveQuiz.keepAfterPersistSeconds);
    return written;
  }

  /** Một `quiz.scored` (kind LIVE) cho MỖI người đã trả lời ≥ 1 câu — `scorePct` = % câu đúng; `attemptId` = sessionId (nguồn XP). */
  private quizScoredEvents(sessionId: string, setId: string, total: number, at: Date, rows: LiveQuizResultCreateInput[]): OutboxEventInput[] {
    return rows
      .filter((r) => r.answered > 0)
      .map((r) => {
        const scorePct = scorePercent(r.correct, total);
        return {
          type: DOMAIN_EVENTS.QUIZ_SCORED,
          aggregateType: "LiveQuizSession",
          aggregateId: sessionId,
          queue: QUIZ_SCORED_OUTBOX.queue,
          jobName: QUIZ_SCORED_OUTBOX.jobName,
          dedupeKey: eventKeys.quizScored("LIVE", sessionId, r.userId),
          payload: {
            event: DOMAIN_EVENTS.QUIZ_SCORED,
            attemptId: sessionId,
            userId: r.userId,
            setId,
            scorePct,
            kind: "LIVE",
            passed: scorePct >= LIVE_QUIZ_PASS_PCT,
            submittedAt: at.toISOString(),
          },
        };
      });
  }
}
