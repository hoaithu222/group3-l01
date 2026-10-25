import { LIMITS } from "../../../core/constants/limits";
import { VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { LiveQuizEndReasonValue, LiveQuizSession } from "../entities/live-quiz.interface";
import { quizErrors } from "../live-quiz.errors";
import { requireHost } from "./live-quiz-access";
import { LIVE_QUIZ_AUDIT, LIVE_QUIZ_PERSIST, OPEN_STATUSES, livePersistDedupeKey, type LiveQuizDeps } from "./live-quiz.types";

type Target = "FINISHED" | "CANCELLED";

/** Đóng phiên (host/hết câu/host-timeout/cron/admin) — MỘT đường duy nhất: CAS Lua trong Redis → Mongo (+ outbox persist) → dọn khoá → `quiz:ended`. */
export class LiveQuizFinishService {
  constructor(
    private readonly d: LiveQuizDeps,
    private readonly now: () => number
  ) {}

  async end(user: AuthUser, sessionId: string, expectedVersion: number, cancel: boolean): Promise<{ status: string }> {
    await requireHost(this.d.store, user, sessionId);
    return this.finish(sessionId, expectedVersion, cancel ? "CANCELLED" : "FINISHED", "HOST_ENDED");
  }

  /**
   * Idempotent: Redis đã đóng (`ALREADY`) mà Mongo còn mở (lần trước chết giữa Lua và Mongo) → hoàn tất bước Mongo + outbox ở lần gọi này,
   * dùng trạng thái ĐÃ có trong Redis (không đổi FINISHED thành CANCELLED chỉ vì người gọi sau xin khác).
   */
  async finish(sessionId: string, expectedVersion: number | null, target: Target, reason: LiveQuizEndReasonValue): Promise<{ status: string }> {
    const res = await this.d.store.finish(sessionId, expectedVersion, target, OPEN_STATUSES);
    if (res.kind === "VERSION") throw new VersionConflictError(res.version);
    if (res.kind === "STATE") throw quizErrors.invalidState(res.status);
    if (res.kind === "GONE") throw quizErrors.notFound();
    const status: Target = res.kind === "OK" ? target : (res.status as Target);
    const meta = await this.d.store.getMeta(sessionId);
    // Gia hạn mọi khoá (`keepAfterEndSeconds`) TRƯỚC khi ghi Mongo+outbox: consumer `live-quiz.persist` (có thể trễ) còn đọc được điểm/đáp án;
    // TTL gốc = `pinTtlMinutes` tính từ lúc tạo nên phiên dài có thể hết hạn ngay sau khi kết thúc — không để crash giữa hai bước làm mất kết quả.
    const keepAlive = (): Promise<void> => (meta ? this.d.store.expireAll(sessionId, meta.total, LIMITS.liveQuiz.keepAfterEndSeconds) : Promise.resolve());
    if (res.kind === "OK") await keepAlive();
    const closedNow = await this.closeInMongo(sessionId, status, reason, res.version);
    if (res.kind === "ALREADY") {
      if (!closedNow) return { status };
      await keepAlive();
    }
    if (meta) await this.d.store.releasePin(meta.pin);
    const [players, scores] = await Promise.all([this.d.store.players(sessionId), this.d.store.scores(sessionId)]);
    this.d.emitter.ended(sessionId, {
      sessionId,
      status,
      reason,
      endReason: reason,
      version: res.version,
      top: scores.slice(0, LIMITS.liveQuiz.leaderboardTop),
      playersCount: players.length,
      resultsReady: false,
      serverNow: this.now(),
    });
    return { status };
  }

  /** Đóng Mongo bằng CAS; FINISHED ghi outbox `live-quiz.persist` CÙNG transaction — chỉ lời gọi đóng được mới ghi. `true` = lời gọi này đóng được. */
  private async closeInMongo(sessionId: string, status: Target, reason: LiveQuizEndReasonValue, version: number): Promise<boolean> {
    const playersCount = (await this.d.store.players(sessionId)).length;
    const input = { status, endReason: reason, endedAt: new Date(this.now()), version, playersCount };
    const { tx, outbox } = this.d;
    if (status !== "FINISHED" || !tx || !outbox) return this.d.repo.closeIfOpen(sessionId, input);
    return tx.run(async (h) => {
      if (!(await this.d.repo.closeIfOpen(sessionId, input, h))) return false;
      await outbox.add(h, {
        type: LIVE_QUIZ_PERSIST.jobName,
        aggregateType: "LiveQuizSession",
        aggregateId: sessionId,
        queue: LIVE_QUIZ_PERSIST.queue,
        jobName: LIVE_QUIZ_PERSIST.jobName,
        dedupeKey: livePersistDedupeKey(sessionId),
        payload: { sessionId },
      });
      return true;
    });
  }

  /**
   * Cron `live-quiz.expire-stale` (be.md §7): phiên WAITING quá `staleWaitingMinutes` / IN_PROGRESS không cập nhật quá
   * `staleInProgressMinutes` → CANCELLED (`EXPIRED`). Redis còn → đi qua `finish()` (CAS Lua + emit); Redis đã mất → chỉ CAS Mongo.
   */
  async expireStale(limit = 100): Promise<number> {
    const now = this.now();
    const L = LIMITS.liveQuiz;
    const stale = await this.d.repo.findStale(new Date(now - L.staleWaitingMinutes * 60_000), new Date(now - L.staleInProgressMinutes * 60_000), limit);
    let closed = 0;
    for (const s of stale) {
      if (await this.d.store.getMeta(s.id)) {
        const r = await this.finish(s.id, null, "CANCELLED", "EXPIRED").catch(() => null);
        if (r?.status === "CANCELLED") closed += 1;
        continue;
      }
      if (await this.closeWithoutRedis(s, "EXPIRED")) closed += 1;
    }
    return closed;
  }

  /**
   * `POST /admin/live-quiz/sessions/:id/end` — admin huỷ phiên đang mở (CANCELLED, `ADMIN_ENDED`, không phát XP). Redis còn → qua `finish()`
   * (CAS Lua + emit `quiz:ended`); Redis đã mất → chỉ CAS Mongo. Ghi audit `live-quiz.admin-end` (lý do bắt buộc) SAU khi đóng được.
   */
  async adminEnd(actor: AuthUser, sessionId: string, reason: string): Promise<{ status: string }> {
    const session = await this.d.repo.findById(sessionId);
    if (!session) throw quizErrors.notFound();
    if (session.status !== "WAITING" && session.status !== "IN_PROGRESS") throw quizErrors.invalidState(session.status);
    if (await this.d.store.getMeta(sessionId)) {
      await this.finish(sessionId, null, "CANCELLED", "ADMIN_ENDED");
    } else if (!(await this.closeWithoutRedis(session, "ADMIN_ENDED"))) {
      throw quizErrors.invalidState();
    }
    await this.d.audit?.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: LIVE_QUIZ_AUDIT.adminEnd,
      targetType: "LiveQuizSession",
      targetId: sessionId,
      ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}),
      reason,
      metadata: { before: session.status, after: "CANCELLED", hostId: session.hostId, setId: session.setId },
    });
    return { status: "CANCELLED" };
  }

  private closeWithoutRedis(s: LiveQuizSession, reason: LiveQuizEndReasonValue): Promise<boolean> {
    return this.d.repo.closeIfOpen(s.id, { status: "CANCELLED", endReason: reason, endedAt: new Date(this.now()), version: s.version, playersCount: s.playersCount });
  }
}
