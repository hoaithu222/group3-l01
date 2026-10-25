import { LIMITS } from "../../../core/constants/limits";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { newObjectId } from "../../../core/utils/object-id";
import type { AuthUser } from "../../../core/types/express";
import { eventKeys } from "../../../shared/events/domain-events";
import type { AnswerDto, AttemptEventDto, CreateAttemptDto, ListAttemptsQueryDto, PutAnswersDto, SubmitDto } from "../dtos";
import type { MockAttempt, MockEventPatch } from "../entities/mock.interface";
import { UniqueViolationError } from "../repositories/errors";
import { mockErrors, studyErrors } from "../study.errors";
import { toAttemptDto, toInProgressDto, toResultDto, toSummaryDto, type MockAttemptDto, type MockInProgressDto, type MockResultDto } from "./mock-attempt.presenter";
import { validateAnswers } from "./mock-answer-validator";
import { MockGradingService } from "./mock-grading.service";
import { pickQuestions, toPublicQuestion, type MockQuestionPublic } from "./mock-question-picker";
import { withMockClock, type MockDeps, type ResolvedMockDeps } from "./mock.deps";
import { startOfLocalDay } from "./local-date";
import { loadSet } from "./study.deps";

export interface CreatedAttemptDto {
  attempt: MockAttemptDto;
  questions: MockQuestionPublic[];
  expiresAt: string;
  serverNow: string;
}

const EVENT_CAS_TRIES = 3;

/**
 * Thi thử có giờ (p4-02 be.md §5.1–§5.3): tạo lượt (snapshot + xáo + `activeKey`), đề KHÔNG đáp án, lưu đáp án theo lô, ghi nhận rời
 * app, nộp. Hạn nộp tính ở SERVER (`expiresAt`); nhận đáp án tới `expiresAt + LIMITS.mock.expireGraceSec`. Chấm ở `MockGradingService`.
 */
export class MockAttemptService {
  private readonly d: ResolvedMockDeps;
  readonly grading: MockGradingService;

  constructor(deps: MockDeps) {
    this.d = withMockClock(deps);
    this.grading = new MockGradingService(this.d);
  }

  async create(user: AuthUser, setId: string, dto: CreateAttemptDto): Promise<CreatedAttemptDto> {
    const d = this.d;
    const set = await loadSet(d, setId);
    await d.access.assertContent(user, set);
    if (set.status !== "ACTIVE") throw studyErrors.notFound();

    const now = d.now();
    const active = await d.attempts.findActive(user.id, set.id);
    if (active) {
      // Lượt dở đã quá hạn mà job chưa kịp nộp hộ → nộp ngay để người dùng làm bài mới, không kẹt `MOCK_002`.
      if (!this.isOverdue(active, now)) throw mockErrors.activeExists(active.id);
      await this.grading.finalize(active.id, "AUTO");
    }

    const tz = await d.users.getTimezone(user.id);
    if ((await d.attempts.countStartedSince(user.id, set.id, startOfLocalDay(now, tz))) >= LIMITS.mock.attemptsPerSetPerDayMax) {
      throw mockErrors.dailyLimit(LIMITS.mock.attemptsPerSetPerDayMax);
    }

    const questions = pickQuestions(await d.items.listBySet(set.id), { count: dto.count, shuffle: dto.shuffle, tags: dto.tags, random: d.random });
    if (questions.length === 0) throw mockErrors.noQuestions();

    const id = newObjectId();
    const expiresAt = new Date(now.getTime() + dto.durationSec * 1000);
    const config = { count: questions.length, durationSec: dto.durationSec, shuffle: dto.shuffle, passPct: dto.passPct };

    let attempt: MockAttempt;
    try {
      attempt = await d.tx.run(async (tx) => {
        // `create` LÀ câu lệnh đầu của transaction: `activeKey` trùng (đua tạo) → lỗi thoát callback, rollback, bắt ở ngoài.
        const created = await d.attempts.create(
          { id, userId: user.id, setId: set.id, setTitle: set.title, setVersion: set.version, config, questions, startedAt: now, expiresAt },
          tx
        );
        // Dòng outbox `availableAt = hạn + grace`: bền qua khởi động lại (không phụ thuộc job delayed trong Redis); nộp tay thì xoá.
        await d.outbox.add(tx, {
          type: "mock-attempt.expire.schedule",
          aggregateType: "MockAttempt",
          aggregateId: id,
          queue: "cron",
          jobName: "mock-attempt.expire",
          dedupeKey: eventKeys.mockExpire(id),
          payload: { attemptId: id, userId: user.id, setId: set.id },
          availableAt: new Date(expiresAt.getTime() + LIMITS.mock.expireGraceSec * 1000),
        });
        return created;
      });
    } catch (err) {
      if (err instanceof UniqueViolationError) throw mockErrors.activeExists((await d.attempts.findActive(user.id, set.id))?.id ?? null);
      throw err;
    }

    return {
      attempt: toAttemptDto(attempt),
      questions: attempt.questions.map((q, i) => toPublicQuestion(q, i)),
      expiresAt: attempt.expiresAt.toISOString(),
      serverNow: d.now().toISOString(),
    };
  }

  /** Đang làm → đề không đáp án + đáp án của tôi; đã kết thúc → kết quả đầy đủ. Quá hạn mà chưa nộp → nộp hộ rồi trả kết quả. */
  async get(user: AuthUser, attemptId: string): Promise<MockInProgressDto | MockResultDto> {
    const d = this.d;
    let attempt = await this.loadOwned(user, attemptId);
    if (attempt.status === "IN_PROGRESS" && this.isOverdue(attempt, d.now())) {
      attempt = (await this.grading.finalize(attemptId, "AUTO")).attempt;
    }
    const answers = await d.answers.listByAttempt(attemptId);
    return attempt.status === "IN_PROGRESS" ? toInProgressDto(attempt, answers, d.now()) : toResultDto(attempt, answers, d.now());
  }

  async listMine(user: AuthUser, query: ListAttemptsQueryDto, setId?: string) {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.d.attempts.list({ userId: user.id, setId, after: after ?? undefined, limit: query.limit + 1 });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return {
      data: page.map(toSummaryDto),
      meta: { nextCursor: hasMore && last ? encodeCursor(last.startedAt, last.id) : null, hasMore, limit: query.limit },
    };
  }

  /** Danh sách lượt của tôi trong MỘT bộ — kiểm quyền đọc bộ trước (không thấy → 404). */
  async listBySet(user: AuthUser, setId: string, query: ListAttemptsQueryDto) {
    await this.d.access.assertContent(user, await loadSet(this.d, setId));
    return this.listMine(user, query, setId);
  }

  async putAnswers(user: AuthUser, attemptId: string, dto: PutAnswersDto): Promise<{ answeredCount: number; serverNow: string }> {
    const attempt = await this.loadOwned(user, attemptId);
    this.assertAcceptingAnswers(attempt, this.d.now());
    return this.saveAnswers(attempt, dto.answers);
  }

  /** Ghi nhận rời/vào lại app — CHỈ đếm, không ảnh hưởng điểm; lượt đã kết thúc/quá `eventsMax`/trùng `clientEventId` → bỏ qua êm. */
  async recordEvent(user: AuthUser, attemptId: string, dto: AttemptEventDto): Promise<void> {
    const d = this.d;
    let attempt = await this.loadOwned(user, attemptId);
    if (attempt.status !== "IN_PROGRESS" || attempt.eventCount >= LIMITS.mock.eventsMax) return;
    if (!(await d.events.claim(`mock-event:${attemptId}:${dto.clientEventId}`, 3600))) return;

    for (let i = 0; i < EVENT_CAS_TRIES; i += 1) {
      const at = new Date(Math.min(Math.max(dto.at.getTime(), attempt.startedAt.getTime()), d.now().getTime()));
      if (await d.attempts.applyEvent(attemptId, attempt.eventCount, this.eventPatch(attempt, dto.type, at))) return;
      const fresh = await d.attempts.findById(attemptId);
      if (!fresh || fresh.status !== "IN_PROGRESS" || fresh.eventCount >= LIMITS.mock.eventsMax) return;
      attempt = fresh;
    }
  }

  async submit(user: AuthUser, attemptId: string, dto: SubmitDto): Promise<MockResultDto> {
    const d = this.d;
    const attempt = await this.loadOwned(user, attemptId);
    let lateAnswersIgnored = false;
    if (attempt.status === "IN_PROGRESS" && dto.answers && dto.answers.length > 0) {
      if (this.isOverdue(attempt, d.now())) lateAnswersIgnored = true;
      else await this.saveAnswers(attempt, dto.answers);
    }
    const { attempt: final, answers } = await this.grading.finalize(attemptId, "MANUAL");
    const result = toResultDto(final, answers, d.now());
    return lateAnswersIgnored ? { ...result, lateAnswersIgnored } : result;
  }

  /** Job `mock-attempt.expire`: nộp hộ khi tới hạn. Đã nộp/hết hạn từ trước → no-op (CAS). */
  async expire(attemptId: string): Promise<"EXPIRED" | "NOOP"> {
    const attempt = await this.d.attempts.findById(attemptId);
    if (!attempt || attempt.status !== "IN_PROGRESS") return "NOOP";
    const { alreadyFinal } = await this.grading.finalize(attemptId, "AUTO");
    return alreadyFinal ? "NOOP" : "EXPIRED";
  }

  // ── nội bộ ───────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Lượt thi chỉ chủ lượt thấy: không có/của người khác → 404 trung tính (kể cả admin). */
  private async loadOwned(user: AuthUser, attemptId: string): Promise<MockAttempt> {
    const attempt = await this.d.attempts.findById(attemptId);
    if (!attempt || attempt.userId !== user.id) throw studyErrors.notFound();
    return attempt;
  }

  private isOverdue(attempt: MockAttempt, now: Date): boolean {
    return now.getTime() > attempt.expiresAt.getTime() + LIMITS.mock.expireGraceSec * 1000;
  }

  private assertAcceptingAnswers(attempt: MockAttempt, now: Date): void {
    if (attempt.status !== "IN_PROGRESS") throw mockErrors.alreadySubmitted();
    if (this.isOverdue(attempt, now)) throw mockErrors.timeUp();
  }

  private async saveAnswers(attempt: MockAttempt, answers: readonly AnswerDto[]): Promise<{ answeredCount: number; serverNow: string }> {
    const d = this.d;
    const { upserts, clears } = validateAnswers(attempt.questions, answers);
    await d.answers.upsertMany(attempt.id, attempt.userId, upserts, d.now());
    await d.answers.deleteMany(attempt.id, clears);
    const answeredCount = await d.answers.countByAttempt(attempt.id);
    await d.attempts.setAnsweredCount(attempt.id, answeredCount);
    return { answeredCount, serverNow: d.now().toISOString() };
  }

  private eventPatch(attempt: MockAttempt, type: AttemptEventDto["type"], at: Date): MockEventPatch {
    if (type === "BACKGROUND") return { backgroundCount: attempt.backgroundCount + 1, lastBackgroundAt: at };
    if (!attempt.lastBackgroundAt) return { lastBackgroundAt: null };
    return { backgroundMs: attempt.backgroundMs + Math.max(0, at.getTime() - attempt.lastBackgroundAt.getTime()), lastBackgroundAt: null };
  }
}

