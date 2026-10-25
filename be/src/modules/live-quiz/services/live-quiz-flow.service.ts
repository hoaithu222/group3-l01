import { LIMITS } from "../../../core/constants/limits";
import { AppError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { logger } from "../../../infrastructure/logger";
import type { QuizSnapshot } from "../entities/live-quiz.events";
import type { QuizMeta } from "../entities/live-quiz.interface";
import { quizErrors } from "../live-quiz.errors";
import { requireHost, requireMeta } from "./live-quiz-access";
import type { LiveQuizFinishService } from "./live-quiz-finish.service";
import { buildSnapshot } from "./live-quiz-snapshot";
import type { LiveQuizDeps } from "./live-quiz.types";

/** Nhịp của một phiên đang chơi: mở câu (start/next/tự chuyển) → nhận đáp án → đóng câu + công bố (be.md §5). */
export class LiveQuizFlowService {
  constructor(
    private readonly d: LiveQuizDeps,
    private readonly finisher: LiveQuizFinishService,
    private readonly now: () => number
  ) {}

  /**
   * Host bấm `start`/`next`. `next` khi câu ĐANG MỞ = chốt câu sớm (đóng + công bố ngay, cùng đường với hết giờ); khi đã công bố = sang câu kế.
   * Lệch `expectedVersion` → `RES_003`; sai trạng thái → `QUIZ_007`.
   */
  async advance(user: AuthUser, sessionId: string, mode: "start" | "next", expectedVersion: number): Promise<QuizSnapshot> {
    const meta = await requireHost(this.d.store, user, sessionId);
    if (mode === "next" && meta.status === "IN_PROGRESS" && meta.phase === "QUESTION") {
      if (meta.version !== expectedVersion) throw new VersionConflictError(meta.version);
      await this.revealQuestion(sessionId, meta.currentIndex);
    } else {
      await this.advanceInternal(sessionId, meta, mode, expectedVersion);
    }
    return buildSnapshot(this.d.store, sessionId, user.id, this.now());
  }

  /**
   * Lệnh `advance` (`autoAdvance`, be.md §5): hết `revealSeconds` sau reveal câu `index` → sang câu kế (hoặc kết thúc). Lệnh trễ/chạy lại:
   * host đã bấm `next`/phiên đã đóng → `currentIndex`/`phase`/`version` lệch → bỏ qua (CAS Lua `advance`).
   */
  async autoAdvance(sessionId: string, index: number): Promise<boolean> {
    const meta = await this.d.store.getMeta(sessionId);
    if (!meta || !meta.autoAdvance || meta.status !== "IN_PROGRESS" || meta.currentIndex !== index || meta.phase !== "REVEAL") return false;
    try {
      await this.advanceInternal(sessionId, meta, "next", meta.version);
      return true;
    } catch (err) {
      if (err instanceof AppError) return false; // VERSION/STATE/GONE = host đã thao tác trước/phiên đã đóng — vô hại
      throw err; // lỗi hạ tầng (Mongo/Redis) → BullMQ retry
    }
  }

  private async advanceInternal(sessionId: string, meta: QuizMeta, mode: "start" | "next", expectedVersion: number): Promise<void> {
    const res = await this.d.store.advance(sessionId, { mode, expectedVersion, seconds: meta.seconds, total: meta.total });
    if (res.kind === "VERSION") throw new VersionConflictError(res.version);
    if (res.kind === "STATE") throw quizErrors.invalidState(res.status);
    if (res.kind !== "OK") {
      // `GONE` = khoá Redis đã hết hạn; `END` = đã qua câu cuối → kết thúc như host bấm end (lý do COMPLETED).
      if (res.kind === "GONE") throw quizErrors.notFound();
      await this.finisher.finish(sessionId, null, "FINISHED", "COMPLETED");
      return;
    }
    await this.d.repo.mirrorProgress(sessionId, {
      version: res.version,
      status: "IN_PROGRESS",
      currentIndex: res.index,
      questionStartedAt: new Date(res.startedAtMs),
      deadlineAt: new Date(res.deadlineAtMs),
      ...(mode === "start" ? { startedAt: new Date(res.startedAtMs) } : {}),
    });
    const q = await this.d.store.question(sessionId, res.index);
    if (q) {
      this.d.emitter.question(sessionId, {
        sessionId,
        index: res.index,
        total: meta.total,
        prompt: q.prompt,
        options: q.options,
        deadlineAt: res.deadlineAtMs,
        questionStartedAt: res.startedAtMs,
        version: res.version,
        serverNow: this.now(),
      });
    }
    // `answerGraceMs`: job chạy SAU hạn (server vẫn chấm theo thời điểm nhận thực tế, Lua từ chối mọi đáp án `now > deadlineAtMs`).
    // Độ trễ = `deadline − started` (cùng đồng hồ `TIME` của Redis) chứ KHÔNG `deadline − Date.now()`: đồng hồ máy API lệch Redis thì lệnh đóng
    // câu sẽ chạy sớm/muộn hàng giây so với hạn thật (đóng câu khi Lua còn nhận đáp án, hoặc để câu treo quá hạn).
    await this.d.scheduler?.schedule({ type: "close", sessionId, index: res.index }, res.deadlineAtMs - res.startedAtMs + LIMITS.liveQuiz.answerGraceMs);
  }

  /**
   * Đóng câu `index` (hết giờ, mọi người đã trả lời, host chốt sớm): CAS Lua `close` đúng MỘT lần rồi emit `quiz:reveal` + `quiz:leaderboard`
   * (top chung) + hạng RIÊNG `me` tới `user:{id}` từng người; `autoAdvance` → hẹn lệnh `advance` sau `revealSeconds`. Lệnh trễ/chạy lại → `false`.
   */
  async revealQuestion(sessionId: string, index: number): Promise<boolean> {
    const meta = await this.d.store.getMeta(sessionId);
    if (!meta || meta.currentIndex !== index) return false;
    if (!(await this.d.store.close(sessionId, index))) return false;
    // Đóng sớm (host/mọi người đã trả lời) → lệnh hết giờ còn treo trở thành thừa; huỷ để khỏi chạy vô ích (không huỷ được cũng vô hại: CAS).
    void Promise.resolve(this.d.scheduler?.cancel({ type: "close", sessionId, index })).catch(() => undefined);
    const [correct, stats, q, scores] = await Promise.all([
      this.d.store.correctOf(sessionId, index),
      this.d.store.stats(sessionId, index),
      this.d.store.question(sessionId, index),
      this.d.store.scores(sessionId),
    ]);
    const serverNow = this.now();
    this.d.emitter.reveal(sessionId, { sessionId, index, correct: correct?.correctIndex ?? null, stats, explanation: q?.explanation ?? null, serverNow });
    const top = scores.slice(0, LIMITS.liveQuiz.leaderboardTop);
    this.d.emitter.leaderboard(sessionId, { sessionId, index, top, playersCount: scores.length, serverNow });
    for (const me of scores) this.d.emitter.me(me.userId, { sessionId, index, me, serverNow });
    if (meta.autoAdvance) await this.d.scheduler?.schedule({ type: "advance", sessionId, index }, meta.revealSeconds * 1000);
    return true;
  }

  /**
   * Nộp đáp án (socket `quiz:answer`): Lua chấm theo `TIME` Redis — một đáp án/người/câu (`QUIZ_004`), quá hạn/câu đã đóng (`QUIZ_005`).
   * KHÔNG trả đúng/sai hay điểm trước `quiz:reveal`. Mỗi đáp án nhận → báo host số người đã trả lời (`quiz:progress`); đủ mọi người → đóng câu sớm.
   */
  async answer(user: AuthUser, sessionId: string, index: number, choice: number): Promise<{ accepted: true; answered: number; players: number }> {
    const meta = await requireMeta(this.d.store, sessionId);
    const res = await this.d.store.answer(sessionId, { userId: user.id, index, choice, base: meta.base, bonus: meta.bonus, seconds: meta.seconds });
    switch (res.kind) {
      case "OK":
        this.d.emitter.progress(meta.hostId, sessionId, async () => {
          const c = await this.d.store.counts(sessionId, index);
          return { sessionId, index, answeredCount: c.answered, playersCount: c.players, serverNow: this.now() };
        });
        if (res.answered >= res.players) await this.closeEarly(sessionId, index);
        return { accepted: true, answered: res.answered, players: res.players };
      case "DUP":
        throw quizErrors.alreadyAnswered();
      case "CLOSED":
        // Câu đã đóng SAU khi người này trả lời (đóng sớm khi đủ người / hết giờ) mà họ gửi lại (ack thất lạc → thử lại) → vẫn là
        // "đã trả lời" (QUIZ_004, client coi như đã gửi), KHÔNG phải "hết giờ".
        if (await this.d.store.hasAnswered(sessionId, index, user.id)) throw quizErrors.alreadyAnswered();
        throw quizErrors.closed();
      case "STATE":
        throw quizErrors.closed();
      case "BAD_CHOICE":
        throw quizErrors.invalidState();
      default:
        throw quizErrors.notFound();
    }
  }

  /** Mọi người đã trả lời → công bố ngay. Lỗi không được làm hỏng ack của đáp án đã ghi — lệnh hết giờ vẫn đóng câu. */
  private async closeEarly(sessionId: string, index: number): Promise<void> {
    try {
      await this.revealQuestion(sessionId, index);
    } catch (err) {
      logger.warn("[live-quiz] Đóng câu sớm lỗi (lệnh hết giờ sẽ đóng)", { sessionId, index, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
