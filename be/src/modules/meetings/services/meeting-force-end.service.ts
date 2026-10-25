import { logger } from "../../../infrastructure/logger";
import type { MeetingEndReasonValue, MeetingEntity } from "../entities/meeting.interface";
import type { NotifyFn } from "./meeting-event.handler";
import type { MeetingRoomDeps } from "./meeting-room.deps";

/** Payload outbox `meeting.force-end` (p2-07 be.md §5.3): `callId` = phiên đang chạy lúc admin bấm — bỏ qua nếu cuộc họp đã đổi phiên (kết thúc rồi bắt đầu lại). */
export interface MeetingForceEndPayload {
  meetingId: string;
  actorId: string;
  callId: string | null;
  reason?: string;
  requestedAt?: string;
}

export type MeetingForceEndResult = "ENDED" | "SKIPPED";

/** Phần `MeetingRoomLifecycleService` mà consumer cần — tách kiểu để unit test không dựng cả phòng họp. */
export interface ForceEndLifecycle {
  endBySystem(meetingId: string, reason: MeetingEndReasonValue, opts?: { actorId?: string }): Promise<MeetingEntity | null>;
}

/**
 * Consumer outbox `meeting.force-end` (p2-07, queue `calls`): admin nền tảng kết thúc cưỡng bức cuộc họp LIVE. Kết thúc đi qua `endBySystem(FORCE_ENDED)` (CAS
 * `status=LIVE` → `Call` kết thúc bằng `endCall` → `deleteRoom` + `meeting:ended { reason: FORCE_ENDED }`), rồi báo CHỦ TRÌ/ĐỒNG CHỦ TRÌ theo lịch bằng hộp thư
 * `meeting.force-ended` (không lộ danh tính admin). IDEMPOTENT khi job retry: `endBySystem` trên cuộc họp đã ENDED trả `null`, còn thông báo dedupe theo phiên —
 * nên lượt retry sau khi đã kết thúc vẫn báo được (nếu lượt trước chết giữa chừng) mà không báo hai lần.
 */
export class MeetingForceEndService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly lifecycle: ForceEndLifecycle,
    private readonly notifyFn: NotifyFn
  ) {}

  async run(p: MeetingForceEndPayload): Promise<MeetingForceEndResult> {
    const before = await this.d.repo.findById(p.meetingId, { includeDeleted: true });
    if (!before) return "SKIPPED";
    // Phiên đã đổi (kết thúc rồi bắt đầu lại trước khi job chạy) → yêu cầu này đã lỗi thời: không kết thúc phiên mới của người khác, không báo nhầm.
    if (p.callId && before.currentCallId && before.currentCallId !== p.callId) return "SKIPPED";
    if (before.status === "LIVE") await this.lifecycle.endBySystem(before.id, "FORCE_ENDED", { actorId: p.actorId });
    const after = before.status === "LIVE" ? await this.d.repo.findById(p.meetingId, { includeDeleted: true }) : before;
    if (!after || after.status !== "ENDED" || after.endReason !== "FORCE_ENDED") return "SKIPPED";
    await this.notifyHosts(after, p).catch((err: unknown) => logger.warn("[meetings] Không báo được chủ trì về force-end", { meetingId: after.id, error: err instanceof Error ? err.message : String(err) }));
    return "ENDED";
  }

  private async notifyHosts(m: MeetingEntity, p: MeetingForceEndPayload): Promise<void> {
    const hosts = (await this.d.repo.findActiveAttendees(m.id)).filter((a) => a.role === "HOST" || a.role === "CO_HOST");
    if (hosts.length === 0) return;
    const key = `meeting-force-ended:${m.id}:${p.callId ?? m.currentCallId ?? "-"}`;
    await this.notifyFn({
      type: "meeting.force-ended",
      scope: { type: "MEETING", id: m.id },
      workspaceId: m.workspaceId,
      source: { type: "Meeting", id: key },
      refs: { meetingId: m.id, workspaceId: m.workspaceId, title: m.title },
      recipients: hosts.map((a) => ({ userId: a.userId })),
      dedupeKey: key,
    });
  }
}
