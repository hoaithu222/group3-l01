import { DOMAIN_EVENTS, eventKeys, type QuizScoredPayload } from "../../../shared/events/domain-events";
import type { MockAnswer, MockAnswerGrade, MockAttempt, MockSubmitModeValue } from "../entities/mock.interface";
import type { SrProgress } from "../entities/sr.interface";
import { STUDY_NOTIFICATION_TYPES } from "../notifications/study.notification-types";
import { studyErrors } from "../study.errors";
import { actingUser, withMockClock, type MockDeps, type ResolvedMockDeps } from "./mock.deps";
import { scoreAttempt, type AttemptScore } from "./mock-scoring";
import { initialWrongState, lapse } from "./sm2";

export interface FinalizeResult {
  attempt: MockAttempt;
  answers: MockAnswer[];
  /** `true` = lượt ĐÃ kết thúc từ trước (CAS thất bại) — không làm gì thêm, trả kết quả hiện có (ST-22). */
  alreadyFinal: boolean;
}

/**
 * Chấm + kết thúc một lượt thi (p4-02 be.md §5.4) — dùng chung cho nộp tay (`MANUAL`), job hết giờ (`AUTO`) và đọc muộn.
 * Chấm trên SNAPSHOT câu hỏi, CAS `IN_PROGRESS → SUBMITTED|EXPIRED` trong MỘT transaction cùng: `correct/partial` từng đáp án, lapse
 * `SrProgress` câu sai, outbox `quiz.scored` (`gamification/xp.consume`), huỷ dòng outbox hết giờ (nộp tay) hoặc `notify` (tự nộp).
 * CAS thất bại (đã kết thúc bởi bên khác) → trả kết quả hiện có, không tạo `quiz.scored` thứ hai.
 */
export class MockGradingService {
  private readonly d: ResolvedMockDeps;

  constructor(deps: MockDeps) {
    this.d = withMockClock(deps);
  }

  async finalize(attemptId: string, mode: MockSubmitModeValue): Promise<FinalizeResult> {
    const d = this.d;
    const attempt = await d.attempts.findById(attemptId);
    if (!attempt) throw studyErrors.notFound();
    if (attempt.status !== "IN_PROGRESS") return { attempt, answers: await d.answers.listByAttempt(attemptId), alreadyFinal: true };

    const submittedAt = d.now();
    const answers = await d.answers.listByAttempt(attemptId);
    const score = scoreAttempt(attempt.questions, answers, attempt.config.passPct);
    const tz = await d.users.getTimezone(attempt.userId);
    // Tạo tiến độ cho câu sai NGOÀI transaction (Mongo: hai tx cùng tạo khoá unique MỚI → P2002 không retry).
    const toLapse = await this.prepareSr(attempt, score, submittedAt, tz);

    const final = await d.tx.run(async (tx) => {
      const done = await d.attempts.finalizeIf(
        attemptId,
        {
          status: mode === "MANUAL" ? "SUBMITTED" : "EXPIRED",
          submitMode: mode,
          submittedAt,
          answeredCount: score.answeredCount,
          correctCount: score.correctCount,
          scorePct: score.scorePct,
          passed: score.passed,
          byTag: score.byTag,
        },
        tx
      );
      if (!done) return null;

      await d.answers.markGraded(this.gradesOf(answers, score), tx);
      for (const p of toLapse) {
        const { status, easiness, interval, repetition, lapses, nextReviewAt } = lapse(p, submittedAt, tz);
        // Lệch phiên bản (vừa ôn thẻ này) → bỏ qua, không làm hỏng lượt nộp.
        await d.progress.updateIf(p.id, p.version, { status, easiness, interval, repetition, lapses, nextReviewAt }, tx);
      }

      const payload: QuizScoredPayload = {
        event: DOMAIN_EVENTS.QUIZ_SCORED,
        attemptId,
        userId: attempt.userId,
        setId: attempt.setId,
        scorePct: score.scorePct,
        kind: "MOCK",
        passed: score.passed,
        submittedAt: submittedAt.toISOString(),
      };
      await d.outbox.add(tx, {
        type: DOMAIN_EVENTS.QUIZ_SCORED,
        aggregateType: "MockAttempt",
        aggregateId: attemptId,
        queue: "gamification",
        jobName: "xp.consume",
        dedupeKey: eventKeys.quizScored("MOCK", attemptId),
        payload: payload as unknown as Record<string, unknown>,
      });

      if (mode === "MANUAL") {
        await d.outbox.cancelPending(tx, eventKeys.mockExpire(attemptId));
      } else {
        await d.notifier.notify(tx, {
          type: STUDY_NOTIFICATION_TYPES.MOCK_AUTO_SUBMITTED,
          scope: null,
          source: { type: "MockAttempt", id: `mock-auto:${attemptId}` },
          refs: { attemptId, setId: attempt.setId },
          recipients: [{ userId: attempt.userId }],
          dedupeKey: `mock-auto:${attemptId}`,
        });
      }
      return done;
    });

    if (!final) {
      const current = await d.attempts.findById(attemptId);
      return { attempt: current ?? attempt, answers: await d.answers.listByAttempt(attemptId), alreadyFinal: true };
    }
    return { attempt: final, answers: await d.answers.listByAttempt(attemptId), alreadyFinal: false };
  }

  /**
   * Câu SAI → tiến độ ôn: chưa có → tạo `LEARNING interval 1` hẹn 00:00 ngày mai (`MOCK_WRONG`); đã có (không `SUSPENDED`) → trả về để
   * áp `lapse` (q = 2) trong transaction. Bỏ qua khi người thi không còn xem được bộ, hoặc mục đã bị xoá khỏi bộ.
   */
  private async prepareSr(attempt: MockAttempt, score: AttemptScore, at: Date, tz: string): Promise<SrProgress[]> {
    const d = this.d;
    const wrongIds = score.results.filter((r) => !r.correct).map((r) => r.itemId);
    if (wrongIds.length === 0) return [];
    const set = await d.sets.findById(attempt.setId);
    if (!set || !(await d.access.canView(actingUser(attempt.userId), set))) return [];

    const items = (await d.items.findByIds(wrongIds)).filter((i) => i.setId === attempt.setId);
    if (items.length === 0) return [];
    const existing = await d.progress.findByUserItems(attempt.userId, items.map((i) => i.id));
    const have = new Set(existing.map((p) => p.itemId));
    const fresh = initialWrongState(at, tz);
    await d.progress.createMissing(
      items.filter((i) => !have.has(i.id)).map((i) => ({ ...fresh, userId: attempt.userId, itemId: i.id, setId: attempt.setId, source: "MOCK_WRONG" as const, itemOrder: i.order }))
    );
    return existing.filter((p) => p.status !== "SUSPENDED");
  }

  private gradesOf(answers: readonly MockAnswer[], score: AttemptScore): MockAnswerGrade[] {
    const byItem = new Map(score.results.map((r) => [r.itemId, r]));
    return answers.flatMap((a) => {
      const r = byItem.get(a.itemId);
      return r ? [{ id: a.id, correct: r.correct, partial: r.partial }] : [];
    });
  }
}
