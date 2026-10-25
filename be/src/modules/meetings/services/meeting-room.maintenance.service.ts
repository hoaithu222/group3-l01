import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { MeetingEntity } from "../entities/meeting.interface";
import type { MeetingHostControlService } from "./meeting-host-control.service";
import { autoCloseAt, autoCloseEvents, meetingEndReasonOf, type AutoClosePhase } from "./meeting-room.schedule";
import { isInRoom } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { MeetingRoomLifecycleService } from "./meeting-room.lifecycle.service";
import type { MeetingRoomSignals } from "./meeting-room.signals";

export interface AutoCloseJob {
  meetingId: string;
  callId: string;
  phase: AutoClosePhase;
}

export interface HostGraceJob {
  meetingId: string;
  callId: string;
}

/**
 * Việc nền của phòng họp (be.md §5.8, §7): tự đóng theo giờ (`meeting.auto-close`), cấp `CO_HOST` tạm khi phòng mất chủ trì (`meeting.host-grace`),
 * điểm danh (`meeting.attendance-finalize`) và cron tự sửa (`meeting.room-reconcile`). MỌI processor KIỂM LẠI trạng thái mới nhất trước khi làm
 * (job có thể cũ/đến muộn) và idempotent — retry, chạy song song hai worker đều cho cùng kết quả.
 */
export class MeetingRoomMaintenanceService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly signals: MeetingRoomSignals,
    private readonly lifecycle: MeetingRoomLifecycleService,
    private readonly hostControl: MeetingHostControlService
  ) {}

  private async liveOf(meetingId: string, callId: string): Promise<MeetingEntity | null> {
    const m = await this.d.repo.findById(meetingId, { includeDeleted: true });
    return m && m.status === "LIVE" && m.currentCallId === callId ? m : null;
  }

  private async limitsForClose(): Promise<{ maxMinutes: number; restartWindowMinutes: number }> {
    const l = await this.d.limits();
    return { maxMinutes: l.maxMinutes, restartWindowMinutes: l.restartWindowMinutes ?? LIMITS.meeting.restartWindowMinutes };
  }

  // ── tự đóng ────────────────────────────────────────────────────────────────

  /** `WARN`: báo `closingAt` trước `closingWarningMinutes`; `CLOSE`: kết thúc `MAX_DURATION` (hoặc hẹn lại nếu giờ đóng đã bị dời — vd gia hạn `endAt`). */
  async autoClose(job: AutoCloseJob): Promise<"SKIPPED" | "WARNED" | "RESCHEDULED" | "CLOSED"> {
    const m = await this.liveOf(job.meetingId, job.callId);
    if (!m) return "SKIPPED";
    const call = await this.d.calls.findCall(job.callId);
    if (!call || call.status === "ENDED") {
      await this.lifecycle.endBySystem(m.id, meetingEndReasonOf(call?.endReason ?? null));
      return "CLOSED";
    }
    const now = this.d.now();
    const due = autoCloseAt(m, call.startedAt, await this.limitsForClose());
    if (job.phase === "WARN" && due.getTime() > now.getTime()) {
      await this.d.store.setClosingAt(job.callId, due);
      this.signals.updated(m, job.callId, { closingAt: due.toISOString() });
      return "WARNED";
    }
    if (due.getTime() > now.getTime() + 30_000) {
      await this.d.tx.run(async (tx) => {
        for (const ev of autoCloseEvents({ meetingId: m.id, callId: job.callId, closeAt: due, now })) await this.d.outbox.add(tx, ev);
      });
      return "RESCHEDULED";
    }
    await this.lifecycle.endBySystem(m.id, "MAX_DURATION");
    return "CLOSED";
  }

  // ── chủ trì mất kết nối ────────────────────────────────────────────────────

  /**
   * Chủ trì/đồng chủ trì cuối cùng vừa rời: hẹn `meeting.host-grace` sau `hostReconnectGraceSeconds` (30 s) — chỉ khi còn người khác trong
   * phòng (phòng trống thì để `emptyTimeout` đóng). "Đang trong phòng" tính theo LIVEKIT (nguồn sự thật): DB (`CallParticipant`) chỉ được đối soát
   * sau webhook vài giây nên hai chủ trì rớt mạng gần nhau vẫn còn ghi `CONNECTED`. LiveKit không trả lời được ⇒ không hẹn (không cấp quyền khi không chắc).
   */
  async scheduleGraceIfHeadless(meeting: MeetingEntity, callId: string, leavingUserId: string): Promise<boolean> {
    const call = await this.d.calls.findCall(callId);
    if (!call || call.status === "ENDED") return false;
    const live = new Set((await this.d.media().listParticipants(call.livekitRoom).catch(() => [])).map((p) => p.identity));
    const others = (await this.d.calls.listParticipants(callId)).filter((p) => p.userId !== leavingUserId && isInRoom(p) && live.has(p.userId));
    if (others.length === 0 || others.some((p) => p.role === "HOST" || p.role === "CO_HOST")) return false;
    await this.d.roomJobs.scheduleHostGrace({ meetingId: meeting.id, callId }, LIMITS.voice.hostReconnectGraceSeconds * 1000).catch((err: unknown) =>
      logger.warn("[meetings] Không hẹn được host-grace", { meetingId: meeting.id, error: err instanceof Error ? err.message : String(err) })
    );
    return true;
  }

  /**
   * Sau grace: vẫn không có chủ trì/đồng chủ trì THẬT SỰ trong phòng (theo LiveKit) → cấp `CO_HOST` phiên cho người được mời vào phòng SỚM NHẤT
   * (loại khách vào qua link). Chủ trì cũ quay lại vẫn là `HOST` (vai theo lịch), không ai mất quyền (MR-11).
   */
  async hostGrace(job: HostGraceJob): Promise<"SKIPPED" | "NOOP" | "NO_CANDIDATE" | "GRANTED"> {
    const m = await this.liveOf(job.meetingId, job.callId);
    const call = m ? await this.d.calls.findCall(job.callId) : null;
    if (!m || !call || call.status === "ENDED") return "SKIPPED";
    const liveIds = new Set((await this.d.media().listParticipants(call.livekitRoom)).map((p) => p.identity));
    const present = (await this.d.calls.listParticipants(job.callId)).filter((p) => isInRoom(p) && liveIds.has(p.userId));
    if (present.some((p) => p.role === "HOST" || p.role === "CO_HOST")) return "NOOP";

    const order = (at: Date | null): number => (at ?? new Date(8.64e15)).getTime();
    const scheduled = new Map((await this.d.repo.findActiveAttendees(m.id)).map((a) => [a.userId, a]));
    const chosen = present
      .filter((p) => scheduled.get(p.userId)?.role === "ATTENDEE" && scheduled.get(p.userId)?.source !== "JOINED_VIA_LINK")
      .sort((a, b) => order(a.firstJoinedAt ?? a.joiningAt) - order(b.firstJoinedAt ?? b.joiningAt))[0];
    if (!chosen) return "NO_CANDIDATE";
    await this.hostControl.applyRole(m, call, null, chosen.userId, "CO_HOST");
    await this.d.audit.record({ actorId: m.hostId, action: "meeting.host-grace", targetType: "Meeting", targetId: m.id, workspaceId: m.workspaceId, metadata: { callId: call.id, grantedTo: chosen.userId, system: true } });
    return "GRANTED";
  }

  // ── điểm danh ──────────────────────────────────────────────────────────────

  /** Ghi ĐÈ `attendedSeconds` = tổng giây CONNECTED qua mọi phiên (không cộng dồn ⇒ chạy lại/retry vẫn đúng — MR-19). Trả số người đổi. */
  async finalizeAttendance(meetingId: string): Promise<number> {
    const m = await this.d.repo.findById(meetingId, { includeDeleted: true });
    if (!m) return 0;
    const attendees = await this.d.repo.findActiveAttendees(meetingId);
    const seconds = await this.d.calls.connectedSecondsByUser(meetingId, attendees.map((a) => a.userId));
    let changed = 0;
    for (const a of attendees) {
      const next = seconds.get(a.userId) ?? 0;
      if (next === a.attendedSeconds) continue;
      await this.d.repo.updateAttendee(undefined, meetingId, a.userId, { attendedSeconds: next });
      changed += 1;
    }
    return changed;
  }

  /** Workspace bị lưu trữ: mọi cuộc họp ĐANG DIỄN RA kết thúc (`WORKSPACE_ARCHIVED`) — SCHEDULED do p2-04 huỷ. Idempotent. */
  async endWorkspaceRooms(workspaceId: string): Promise<number> {
    let ended = 0;
    for (const m of await this.d.repo.findOpenByWorkspace(workspaceId)) {
      if (m.status === "LIVE" && (await this.lifecycle.endBySystem(m.id, "WORKSPACE_ARCHIVED"))) ended += 1;
    }
    return ended;
  }

  // ── cron tự sửa ────────────────────────────────────────────────────────────

  /**
   * Cuộc họp LIVE lệch với cuộc gọi (phiên bị kết thúc từ nơi khác: `calls` thu hồi/recovery/admin, webhook `room_finished` bị mất) hoặc quá giờ
   * đóng mà job hẹn bị mất (Redis/worker sự cố) → kết thúc. Lưới an toàn — đường chính vẫn là webhook + job hẹn giờ.
   */
  async reconcileLive(): Promise<{ scanned: number; ended: number }> {
    const live = await this.d.repo.findLive(200);
    const limits = await this.limitsForClose();
    const now = this.d.now();
    let ended = 0;
    for (const m of live) {
      try {
        const call = m.currentCallId ? await this.d.calls.findCall(m.currentCallId) : null;
        if (!call || call.status === "ENDED") {
          if (await this.lifecycle.endBySystem(m.id, meetingEndReasonOf(call?.endReason ?? null))) ended += 1;
        } else if (now.getTime() >= autoCloseAt(m, call.startedAt, limits).getTime() + 60_000) {
          if (await this.lifecycle.endBySystem(m.id, "MAX_DURATION")) ended += 1;
        }
      } catch (err) {
        logger.warn("[meetings] room-reconcile lỗi một cuộc họp", { meetingId: m.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { scanned: live.length, ended };
  }
}
