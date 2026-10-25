import { permissionService } from "../../../core/permission";
import { logger } from "../../../infrastructure/logger";
import type { AttendeeEntity, MeetingEntity } from "../entities/meeting.interface";
import type { NotifyFn } from "./meeting-event.handler";
import type { MeetingEventPayload } from "./meeting-events";
import { isInRoom } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { MeetingRoomLifecycleService } from "./meeting-room.lifecycle.service";
import type { MeetingRoomSignals } from "./meeting-room.signals";
import type { SystemMessagePoster } from "./meeting-reminder.service";

type Started = Extract<MeetingEventPayload, { event: "started" }>;
type Ended = Extract<MeetingEventPayload, { event: "ended" }>;
type LockChanged = Extract<MeetingEventPayload, { event: "lock-changed" }>;

/**
 * Phần phòng họp của handler outbox `meeting.events` (`MeetingEventHandler` gọi vào đây): mọi việc SAU commit của start/end/khoá/loại người khỏi phòng.
 * Idempotent (job retry ≤ 3): `notify()` theo `dedupeKey`, tin hệ thống theo `dedupeKey`, `afterEnded` an toàn khi lặp, socket trùng vô hại (client so `version`).
 * Request của chủ trì đã phát socket TRỰC TIẾP (tiến trình API có `getIO()`); ở đây phát lại làm bản dự phòng (ở worker qua cầu nối Redis — p0-03;
 * `started`/`updated`/`ended` mang `version` nên client bỏ bản trùng).
 */
export class MeetingRoomEventHandler {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly signals: MeetingRoomSignals,
    private readonly lifecycle: MeetingRoomLifecycleService,
    private readonly notifyFn: NotifyFn,
    private readonly messages: SystemMessagePoster
  ) {}

  async onStarted(m: MeetingEntity, attendees: AttendeeEntity[], p: Started): Promise<void> {
    await this.signals.started(m, { callId: p.callId, startedBy: p.startedBy, restarted: p.restarted });
    // Push "Cuộc họp đã bắt đầu": người được mời CHƯA ở trong phòng, trừ người bắt đầu (DND do lõi thông báo tôn trọng — loại `meeting.started` không bypass).
    const inRoom = new Set((await this.d.calls.listParticipants(p.callId)).filter(isInRoom).map((x) => x.userId));
    const recipients = attendees.filter((a) => a.userId !== p.startedBy && !inRoom.has(a.userId)).map((a) => ({ userId: a.userId }));
    if (recipients.length > 0) {
      const key = `meeting-started:${m.id}:${p.callId}`;
      await this.notifyFn({
        type: "meeting.started",
        scope: { type: "MEETING", id: m.id },
        workspaceId: m.workspaceId,
        actorId: p.startedBy,
        source: { type: "Meeting", id: key },
        refs: { meetingId: m.id, workspaceId: m.workspaceId, callId: p.callId },
        recipients,
        dedupeKey: key,
      });
    }
    // Một tin/phiên vào nhóm chat họp (nếu đã có nhóm chat). `MEETING_STARTED` = `{ meetingId, title, startedAt }` (`startedAt` = lúc PHIÊN này bắt đầu, để thẻ chat hiện giờ bắt đầu);
    // khi họp kết thúc thẻ được sửa tại chỗ thêm `endedAt`/`durationSec` (`closeStartedCard`).
    if (m.conversationId) {
      const startedAt = (await this.d.calls.findCall(p.callId))?.startedAt ?? this.d.now();
      await this.messages.post({
        scopeType: "CONVERSATION",
        scopeId: m.conversationId,
        workspaceId: m.workspaceId,
        systemType: "MEETING_STARTED",
        payload: { meetingId: m.id, title: m.title, startedAt },
        dedupeKey: `sys:meeting-started:${p.callId}`,
      });
    }
  }

  async onEnded(m: MeetingEntity, p: Ended): Promise<void> {
    await this.lifecycle.afterEnded(m, { callId: p.callId, reason: p.reason, actorId: p.actorId });
  }

  onLockChanged(m: MeetingEntity, p: LockChanged): void {
    this.signals.updated(m, p.callId, { lockedAt: p.lockedAt });
  }

  /**
   * Vai theo LỊCH đổi khi đang họp (p2-04 `setRole`/`transferHost`): đồng bộ vai TRONG PHIÊN (`CallParticipant.role`) + metadata LiveKit + báo người đó.
   * Chỉ chạm người đang ở trong phòng và chỉ khi vai thực sự khác — vai `CO_HOST` cấp tạm trong phiên của người KHÔNG nằm trong `userIds` giữ nguyên.
   */
  async onRolesChanged(m: MeetingEntity, userIds: string[]): Promise<void> {
    if (m.status !== "LIVE" || !m.currentCallId) return;
    const call = await this.d.calls.findCall(m.currentCallId);
    if (!call || call.status === "ENDED") return;
    for (const userId of userIds) {
      const p = await this.d.calls.findParticipant(call.id, userId);
      if (!p || !isInRoom(p)) continue;
      const a = await this.d.repo.findAttendee(m.id, userId);
      const role = a && !a.removedAt && a.role !== "ATTENDEE" ? a.role : "MEMBER";
      if (p.role === role || !(await this.d.calls.setRole(call.id, userId, role))) continue;
      await this.d
        .media()
        .updateParticipant(call.livekitRoom, userId, { metadata: JSON.stringify({ v: 1, callId: call.id, meetingId: m.id, role }) })
        .catch((err: unknown) => logger.warn("[meetings] Không cập nhật metadata vai trò (non-fatal)", { meetingId: m.id, error: err instanceof Error ? err.message : String(err) }));
      this.signals.hostAction(call.id, [userId], { type: "ROLE_CHANGED", byUserId: null, targetUserId: userId, role });
    }
  }

  /**
   * Chủ trì xoá người khỏi danh sách tham dự khi đang họp (`wasLive`) / người bị loại khỏi workspace: đá khỏi phòng LiveKit + chặn vào lại phiên này
   * (participant `REMOVED`) + rút khỏi phòng chờ. (Thu hồi quyền workspace cũng đi qua `calls` — `call.revocation` — nhưng đây là đường DUY NHẤT
   * cho người bị xoá riêng khỏi cuộc họp.)
   */
  async onAttendeesRemoved(m: MeetingEntity, removed: string[]): Promise<void> {
    if (m.status !== "LIVE" || !m.currentCallId) return; // phòng chờ/phòng LiveKit chỉ tồn tại khi cuộc họp đang LIVE
    for (const userId of removed) await this.d.store.removeLobby(m.id, userId);
    const callId = m.currentCallId;
    for (const userId of removed) {
      const p = await this.d.calls.findParticipant(callId, userId);
      if (!p || !isInRoom(p)) continue;
      if (await this.d.calls.removeParticipant(callId, userId, null)) {
        await permissionService
          .revokeScope({ scope: { type: "CALL", id: callId }, userIds: [userId], reason: "REMOVED", cascade: false })
          .catch((err: unknown) => logger.warn("[meetings] revokeScope CALL lỗi (non-fatal)", { meetingId: m.id, error: err instanceof Error ? err.message : String(err) }));
        this.signals.hostAction(callId, [userId], { type: "REMOVED", byUserId: null, targetUserId: userId });
      }
    }
  }
}
