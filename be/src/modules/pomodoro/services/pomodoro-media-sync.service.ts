import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import type { PomodoroSessionEntity } from "../entities/pomodoro.interface";
import { isHostExempt, isMicLockedPhase, permissionFor, publishFor } from "./pomodoro-media-policy";
import { isPresentState, type PomodoroDeps, type PomodoroParticipant } from "./pomodoro.ports";

type Deps = Pick<PomodoroDeps, "repo" | "calls" | "media">;

export interface MediaSyncResult {
  applied: number;
  /** Lỗi thật (không tính "người này chưa ở trong phòng LiveKit") — job `pomodoro.media-sync` ném lại để BullMQ thử lại. */
  failed: number;
}

/**
 * Thực thi luật mic theo phase ở MÁY CHỦ MEDIA (p5-02 README §2, không tin client): áp phase HIỆN TẠI của phiên cho từng người trong phòng —
 * (1) `CallParticipant.publishPermissions` ở DB (token cấp lại `POST /calls/:id/token` đọc đúng giá trị này) và (2) LiveKit
 * `updateParticipant` (THAY THẾ nguyên khối quyền). Idempotent: luôn áp trạng thái hiện tại nên chạy lặp/trễ vô hại; tuần tự vì phòng ≤ 8 người.
 */
export class PomodoroMediaSync {
  constructor(private readonly d: Deps) {}

  async syncAll(sessionId: string): Promise<MediaSyncResult> {
    const session = await this.d.repo.findById(sessionId);
    const result: MediaSyncResult = { applied: 0, failed: 0 };
    if (!session?.callId || session.phase === "ENDED") return result;
    const call = await this.d.calls.findCall(session.callId);
    if (!call || call.status === "ENDED") return result;
    const members = (await this.d.calls.listParticipants(call.id)).filter((p) => isPresentState(p.state));
    for (const p of members) await this.apply(session, call.livekitRoom, p, result);
    return result;
  }

  /** Người vừa kết nối LiveKit (webhook `participant_joined`): áp ngay luật hiện tại — đóng khoảng hở giữa lúc cấp token và lúc đổi phase. */
  async syncOne(sessionId: string, userId: string): Promise<MediaSyncResult> {
    const session = await this.d.repo.findById(sessionId);
    const result: MediaSyncResult = { applied: 0, failed: 0 };
    if (!session?.callId || session.phase === "ENDED") return result;
    const [call, p] = await Promise.all([this.d.calls.findCall(session.callId), this.d.calls.findParticipant(session.callId, userId)]);
    if (call && call.status !== "ENDED" && p && isPresentState(p.state)) await this.apply(session, call.livekitRoom, p, result);
    return result;
  }

  private async apply(session: PomodoroSessionEntity, room: string, member: PomodoroParticipant, out: MediaSyncResult): Promise<void> {
    const locked = isMicLockedPhase(session.phase, session.previousPhase);
    const exempt = isHostExempt(session.config, member.userId === session.hostUserId);
    const updated = (await this.d.calls.setPublish(session.callId as string, member.userId, publishFor(locked, exempt))) ?? member;
    try {
      await this.d.media().updateParticipant(room, member.userId, { permission: permissionFor(this.d.calls.baseSources(updated), locked, exempt) });
      out.applied += 1;
    } catch (err) {
      // Người chưa kết nối LiveKit (JOINING) → phòng/participant lạ (MEDIA_004): bình thường, token của họ đã đúng luật (DB) và `participant_joined` sẽ áp lại.
      if (err instanceof AppError && err.errorCode === ErrorCode.MEDIA_004) return;
      out.failed += 1;
      logger.warn("[pomodoro] Không áp được quyền publish (sẽ thử lại)", { sessionId: session.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
