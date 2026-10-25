import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import { isRunningPhase, type PomodoroSessionEntity } from "../entities/pomodoro.interface";
import { isChannelOpen } from "./pomodoro-channel";
import type { PomodoroMediaSync } from "./pomodoro-media-sync.service";
import type { PomodoroEvent } from "./pomodoro-state-machine";
import type { PomodoroTransitions } from "./pomodoro-transition.service";
import type { PomodoroDeps } from "./pomodoro.ports";

export type RunResult = "APPLIED" | "STALE" | "NOOP";

const SCAN_LIMIT = 200;
const MINUTE_MS = 60_000;
/** Phiên chưa từng có phòng (`callId = null`) và chưa quá tuổi này: người bấm bắt đầu có thể đang trong lúc vào phòng — chưa coi là rỗng. */
const NO_CALL_GRACE_MS = 2 * MINUTE_MS;
/** Dư thêm sau `emptyRoomEndMinutes` trước khi cron kết thúc thay cho job hẹn giờ bị mất. */
const EMPTY_END_SLACK_MS = MINUTE_MS;

/**
 * Xử lý sự kiện HỆ THỐNG của phiên (job hẹn giờ, webhook LiveKit, cron quét bù) — chạy ở BẤT KỲ tiến trình nào (API hoặc worker) vì mọi thay đổi
 * đều là CAS `(version, phase)` ở DB; phát `pomodoro:updated` do `broadcaster` lo (worker chưa có `getIO()` nên nhờ tiến trình API phát). Mọi hàm
 * idempotent: job trễ/chạy lặp/hai worker cùng deadline chỉ MỘT lần chuyển phase (PM-03); job cũ (version lệch) no-op.
 */
export class PomodoroRunner {
  constructor(
    private readonly d: PomodoroDeps,
    private readonly transitions: PomodoroTransitions,
    private readonly media: PomodoroMediaSync
  ) {}

  /** Job `pomodoro.deadline`: hết giờ phase → phase kế tiếp; quá hạn hơn `recoveryLagSeconds` (BE/worker chết) → tạm dừng RECOVERY, không cộng vòng ảo (PM-05). */
  async onDeadline(p: { sessionId: string; version: number; phase: string }): Promise<RunResult> {
    const s = await this.d.repo.findById(p.sessionId);
    if (!s || s.version !== p.version || s.phase !== p.phase) return "STALE";
    return this.tick(s);
  }

  /** Job `pomodoro.empty-room`: sau `emptyRoomEndMinutes` phòng vẫn rỗng → kết thúc phiên (PM-07). Có người quay lại → giữ nguyên. */
  async onEmptyRoomExpired(p: { sessionId: string; version: number }): Promise<RunResult> {
    const s = await this.d.repo.findById(p.sessionId);
    if (!s || s.version !== p.version || s.phase === "ENDED" || s.pauseReason !== "EMPTY_ROOM") return "STALE";
    if (!(await this.isRoomEmpty(s))) return "NOOP";
    return this.run(s, { type: "end", reason: "EMPTY_ROOM" });
  }

  /** Webhook `participant_left`/`room_finished`: phòng vừa rỗng → tạm dừng EMPTY_ROOM + hẹn 5 phút. */
  async onMaybeEmpty(sessionId: string): Promise<RunResult> {
    const s = await this.d.repo.findById(sessionId);
    if (!s || s.phase === "ENDED" || s.pauseReason === "EMPTY_ROOM") return "NOOP";
    if (!(await this.isRoomEmpty(s))) return "NOOP";
    return this.run(s, { type: "emptyRoom" });
  }

  /** Webhook `participant_joined`: có người vào khi phòng đang đếm rỗng → huỷ đếm (phiên tạm dừng vẫn chờ chủ phòng bấm tiếp tục). */
  async onOccupied(sessionId: string): Promise<RunResult> {
    const s = await this.d.repo.findById(sessionId);
    if (!s || s.phase === "ENDED" || s.pauseReason !== "EMPTY_ROOM") return "NOOP";
    return this.run(s, { type: "roomOccupied" });
  }

  /** Job `pomodoro.media-sync`: áp lại luật mic hiện tại; còn người chưa áp được thì ném để BullMQ thử lại. */
  async onMediaSync(sessionId: string): Promise<void> {
    const r = await this.media.syncAll(sessionId);
    if (r.failed > 0) throw new Error(`Chưa áp được quyền publish cho ${r.failed} người`);
  }

  /** Job `pomodoro.host-sync` (hẹn sau khi chủ phiên rời): đồng bộ `hostUserId` theo `Call.hostId`. */
  async onHostSync(sessionId: string): Promise<void> {
    const s = await this.d.repo.findById(sessionId);
    if (s) await this.transitions.syncHost(s);
  }

  /**
   * Cron `pomodoro.reconcile` (mỗi phút — lưới an toàn khi job hẹn giờ trôi/Redis restart, PM-05): (1) phase quá hạn → chuyển/RECOVERY;
   * (2) kênh/nhóm đã lưu trữ → kết thúc; (3) đồng bộ chủ phòng; (4) phòng rỗng chưa được đánh dấu → tạm dừng, đã đánh dấu quá hạn → kết thúc.
   */
  async reconcile(): Promise<{ overdue: number; scanned: number }> {
    const now = this.d.now();
    const overdue = await this.d.repo.listOverdueRunning(now, SCAN_LIMIT);
    for (const s of overdue) await this.safe(() => this.tick(s), s.id);
    const active = await this.d.repo.listActive(SCAN_LIMIT);
    for (const s of active) await this.safe(() => this.sweep(s), s.id);
    return { overdue: overdue.length, scanned: active.length };
  }

  private async sweep(session: PomodoroSessionEntity): Promise<void> {
    const channel = await this.d.channels.get(session.channelId);
    if (!channel || !isChannelOpen(channel)) {
      await this.run(session, { type: "end", reason: "CHANNEL_ARCHIVED" });
      return;
    }
    const s = await this.transitions.syncHost(session);
    if (s.phase === "ENDED") return;
    if (s.pauseReason === "EMPTY_ROOM") {
      const due = s.updatedAt.getTime() + LIMITS.pomodoro.emptyRoomEndMinutes * MINUTE_MS + EMPTY_END_SLACK_MS <= this.d.now().getTime();
      if (due && (await this.isRoomEmpty(s))) await this.run(s, { type: "end", reason: "EMPTY_ROOM" });
      return;
    }
    if (await this.isRoomEmpty(s)) await this.run(s, { type: "emptyRoom" });
  }

  private tick(s: PomodoroSessionEntity): Promise<RunResult> {
    if (!isRunningPhase(s.phase) || !s.phaseEndsAt) return Promise.resolve("STALE");
    const lagMs = this.d.now().getTime() - s.phaseEndsAt.getTime();
    return this.run(s, lagMs > LIMITS.pomodoro.recoveryLagSeconds * 1000 ? { type: "recover" } : { type: "deadline" });
  }

  private async run(s: PomodoroSessionEntity, event: PomodoroEvent): Promise<RunResult> {
    const r = await this.transitions.apply(s, event, { actorId: null });
    return r.kind === "OK" ? "APPLIED" : "NOOP";
  }

  /**
   * Phòng rỗng = LiveKit KHÔNG còn ai (nguồn sự thật — webhook có thể trễ/mất) VÀ không ai đang `JOINING` (vừa nhận token, chưa kịp kết nối).
   * Phiên chưa có phòng chỉ coi là rỗng sau `NO_CALL_GRACE_MS` (người bấm bắt đầu còn đang vào phòng).
   */
  private async isRoomEmpty(s: PomodoroSessionEntity): Promise<boolean> {
    if (!s.callId) return this.d.now().getTime() - s.createdAt.getTime() > NO_CALL_GRACE_MS;
    const call = await this.d.calls.findCall(s.callId);
    if (!call || call.status === "ENDED") return true;
    const [live, members] = await Promise.all([this.d.media().listParticipants(call.livekitRoom), this.d.calls.listParticipants(call.id)]);
    return live.length === 0 && !members.some((m) => m.state === "JOINING");
  }

  private async safe(fn: () => Promise<unknown>, sessionId: string): Promise<void> {
    try {
      await fn();
    } catch (err) {
      logger.warn("[pomodoro] Quét bù lỗi một phiên (bỏ qua, phút sau quét lại)", { sessionId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
