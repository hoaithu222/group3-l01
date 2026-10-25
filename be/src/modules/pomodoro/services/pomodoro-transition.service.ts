import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import { logger } from "../../../infrastructure/logger";
import type { OutboxEventInput } from "../../../infrastructure/queue";
import { createBurnoutSignalPort } from "../../burnout";
import {
  POMODORO_JOB,
  POMODORO_QUEUE,
  type NewPomodoroSession,
  type PomodoroConfig,
  type PomodoroEndReason,
  type PomodoroSessionEntity,
} from "../entities/pomodoro.interface";
import type { TxHandle } from "../repositories/tx";
import { isHostExempt, isMicLockedPhase } from "./pomodoro-media-policy";
import type { PomodoroMediaSync } from "./pomodoro-media-sync.service";
import { transition, type PomodoroEvent, type TransitionEffects } from "./pomodoro-state-machine";
import type { PomodoroDeps } from "./pomodoro.ports";

/** Trần chờ đồng bộ media TRONG request lệnh của chủ phòng — quá thì để job bền `pomodoro.media-sync` làm nốt (LiveKit chậm không được treo lệnh). */
const MEDIA_SYNC_BUDGET_MS = 1500;
const MINUTE_MS = 60_000;

// p7-03 be.md §5 "Collector" — cổng burnout radar: ghi MỘT tín hiệu hoạt động cho mỗi người có mặt khi phiên Pomodoro kết thúc (cổng tự kiểm đã bật theo dõi chưa, không bao giờ ném lỗi).
const burnoutSignal = createBurnoutSignalPort();

export type ApplyOutcome =
  | { kind: "OK"; before: PomodoroSessionEntity; session: PomodoroSessionEntity }
  | { kind: "INVALID_PHASE" | "NOT_DUE" | "NOOP" | "CONFLICT" };

export interface ApplyOptions {
  actorId?: string | null;
}

function withBudget<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Quá ${ms}ms`)), ms);
    timer.unref();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Phiên WAITING trắng — mọi trường nullable ghi null TƯỜNG MINH (Prisma+Mongo: `{ field: null }` không khớp trường vắng mặt). */
const blankSession = (channelId: string, workspaceId: string, hostUserId: string, config: PomodoroConfig): Omit<NewPomodoroSession, "id"> => ({
  channelId,
  workspaceId,
  hostUserId,
  callId: null,
  config,
  phase: "WAITING",
  previousPhase: null,
  phaseStartedAt: null,
  phaseEndsAt: null,
  remainingMs: null,
  completedFocusCycles: 0,
  skippedFocusCycles: 0,
  pauseReason: null,
  startedAt: null,
  endedAt: null,
  endReason: null,
});

/**
 * Lõi áp dụng chuyển trạng thái (be.md §5 "Áp dụng"): máy trạng thái thuần → CAS `(version, phase)` + outbox (deadline hẹn giờ BỀN, media-sync,
 * empty-room) TRONG cùng transaction → sau commit: phát `pomodoro:updated`, áp luật mic ở máy chủ media (có trần thời gian), đóng `Call` khi ENDED.
 * Hai lệnh cùng version / hai worker cùng deadline chỉ một bên thắng CAS (PM-03). Không phát socket từ worker: `broadcaster` tự chọn đường phát.
 */
export class PomodoroTransitions {
  constructor(
    private readonly d: PomodoroDeps,
    private readonly media: PomodoroMediaSync
  ) {}

  async apply(session: PomodoroSessionEntity, event: PomodoroEvent, opts: ApplyOptions = {}): Promise<ApplyOutcome> {
    const now = this.d.now();
    const out = transition(session, event, now);
    if (!out.ok) return { kind: out.reason };
    const changesMedia = (next: PomodoroSessionEntity): boolean =>
      isMicLockedPhase(session.phase, session.previousPhase) !== isMicLockedPhase(next.phase, next.previousPhase);
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.repo.updateSession(tx, session.id, { version: session.version, phase: session.phase }, out.patch);
      if (!u) return null;
      await this.record(tx, u, out.effects, changesMedia(u));
      if (out.effects.cycleCompletedFrom) await this.d.repo.incrementCyclesAttended(tx, u.id, out.effects.cycleCompletedFrom);
      if (out.effects.finalizePresence) await this.d.repo.finalizePresence(tx, u.id, now);
      return u;
    });
    if (!updated) return { kind: "CONFLICT" };
    await this.afterCommit(updated, changesMedia(updated), opts.actorId ?? null);
    return { kind: "OK", before: session, session: updated };
  }

  /** Tạo phiên mới của kênh (`activeKey` unique → `PomodoroActiveConflictError` nếu đã có): `WAITING` (mở phòng) hoặc `FOCUS` ngay (bắt đầu). */
  async create(channel: { id: string; workspaceId: string; defaultConfig: PomodoroConfig }, hostUserId: string, startNow: boolean): Promise<PomodoroSessionEntity> {
    const now = this.d.now();
    const base = blankSession(channel.id, channel.workspaceId, hostUserId, channel.defaultConfig);
    const out = startNow ? transition(base, { type: "start" }, now) : null;
    const created = await this.d.tx.run(async (tx) => {
      const s = await this.d.repo.createSession(tx, { id: newObjectId(), ...base, ...(out?.ok ? out.patch : {}) });
      if (out?.ok) await this.record(tx, s, out.effects, false);
      return s;
    });
    await this.d.broadcaster.broadcast(created.id).catch((err: unknown) => this.warn("Không phát được phiên mới", created.id, err));
    return created;
  }

  /** Chủ phiên theo `Call.hostId` (failover chủ phòng của `calls` đổi `hostId` — be.md README §2 "Host"): lệch thì CAS `hostUserId` rồi phát. */
  async syncHost(session: PomodoroSessionEntity): Promise<PomodoroSessionEntity> {
    if (!session.callId || session.phase === "ENDED") return session;
    const call = await this.d.calls.findCall(session.callId);
    if (!call || call.status === "ENDED" || !call.hostId || call.hostId === session.hostUserId) return session;
    const updated = await this.d.repo.updateSession(undefined, session.id, { version: session.version }, { hostUserId: call.hostId });
    if (!updated) return (await this.d.repo.findById(session.id)) ?? session;
    await this.d.broadcaster.broadcast(updated.id).catch((err: unknown) => this.warn("Không phát được đổi chủ phòng", updated.id, err));
    // Chủ phòng được miễn khoá mic (P1) đổi người ⇒ áp lại luật cho cả hai.
    if (isHostExempt(updated.config, true)) await this.syncMedia(updated.id);
    return updated;
  }

  /** Ghi việc sau commit vào outbox (cùng transaction với CAS). */
  private async record(tx: TxHandle, u: PomodoroSessionEntity, effects: TransitionEffects, mediaChanged: boolean): Promise<void> {
    const now = this.d.now();
    const event = (name: string, dedupeKey: string, payload: Record<string, unknown>, delayMs = 0): OutboxEventInput => ({
      type: name,
      aggregateType: "PomodoroSession",
      aggregateId: u.id,
      queue: POMODORO_QUEUE,
      jobName: name,
      dedupeKey,
      delayMs: delayMs > 0 ? delayMs : undefined,
      payload,
    });
    if (effects.deadline) {
      const delay = Math.max(0, effects.deadline.at.getTime() - now.getTime());
      await this.d.outbox.add(
        tx,
        event(POMODORO_JOB.deadline, `${POMODORO_JOB.deadline}:pomo:${u.id}:v${u.version}`, { sessionId: u.id, version: u.version, phase: effects.deadline.phase }, delay)
      );
    }
    if (effects.armEmptyRoom) {
      const delay = LIMITS.pomodoro.emptyRoomEndMinutes * MINUTE_MS;
      await this.d.outbox.add(tx, event(POMODORO_JOB.emptyRoom, `${POMODORO_JOB.emptyRoom}:pomo:${u.id}:v${u.version}`, { sessionId: u.id, version: u.version }, delay));
    }
    if (mediaChanged && u.callId && u.phase !== "ENDED") {
      await this.d.outbox.add(tx, event(POMODORO_JOB.mediaSync, `${POMODORO_JOB.mediaSync}:pomo:${u.id}:v${u.version}`, { sessionId: u.id, version: u.version }));
    }
  }

  private async afterCommit(u: PomodoroSessionEntity, mediaChanged: boolean, actorId: string | null): Promise<void> {
    await this.d.broadcaster.broadcast(u.id).catch((err: unknown) => this.warn("Không phát được pomodoro:updated", u.id, err));
    if (u.phase === "ENDED") {
      if (u.callId) await this.d.calls.endCall(u.callId, (u.endReason ?? "HOST_ENDED") as PomodoroEndReason, actorId).catch((err: unknown) => this.warn("Không đóng được phòng", u.id, err));
      await this.recordBurnoutSignal(u);
      return;
    }
    if (mediaChanged && u.callId) await this.syncMedia(u.id);
  }

  /** p7-03 — phiên vừa ENDED: mỗi người từng có mặt (`listPresence`) được ghi MỘT tín hiệu hoạt động (best-effort, không chặn luồng kết thúc phiên). */
  private async recordBurnoutSignal(session: PomodoroSessionEntity): Promise<void> {
    try {
      const presences = await this.d.repo.listPresence(session.id);
      const at = session.endedAt ?? this.d.now();
      await Promise.all(presences.map((p) => burnoutSignal.recordEvent(p.userId, at, `pomodoro.session:${session.id}:user:${p.userId}`)));
    } catch (err) {
      this.warn("Không ghi được tín hiệu burnout", session.id, err);
    }
  }

  private async syncMedia(sessionId: string): Promise<void> {
    await withBudget(this.media.syncAll(sessionId), MEDIA_SYNC_BUDGET_MS).catch((err: unknown) => this.warn("Đồng bộ media chưa xong (job bền sẽ làm nốt)", sessionId, err));
  }

  private warn(message: string, sessionId: string, err: unknown): void {
    logger.warn(`[pomodoro] ${message}`, { sessionId, error: err instanceof Error ? err.message : String(err) });
  }
}
