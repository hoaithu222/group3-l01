import { permissionService, type ScopeRef } from "../../../core/permission";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import type { NotifyInput } from "../../notifications/public";
import type { AttendeeEntity, MeetingEntity } from "../entities/meeting.interface";
import type { MeetingDeps } from "./meeting.deps";
import type { MeetingEventPayload } from "./meeting-events";
import type { MeetingJobsPort } from "./meeting-jobs.port";
import type { MeetingRecapRecordingEvents } from "./meeting-recap-recording.events";
import type { MeetingRoomEventHandler } from "./meeting-room.event.handler";

export type NotifyFn = (input: NotifyInput) => Promise<void>;
export type MeetingEventSink = (payload: MeetingEventPayload) => Promise<void>;

/** Sink của module khác (p2-05 phòng họp: loại người bị xoá khỏi phòng LIVE; p2-06 biên bản) — đăng ký lúc import file job. */
const sinks = new Map<string, MeetingEventSink>();
export function registerMeetingEventSink(name: string, sink: MeetingEventSink): void {
  sinks.set(name, sink);
}
export function clearMeetingEventSinks(): void {
  sinks.clear();
}

const scopeOf = (m: MeetingEntity): NonNullable<NotifyInput["scope"]> => ({ type: "MEETING", id: m.id });

/**
 * Xử lý sự kiện outbox `meeting.events` (be.md §7): đặt/xoá nhắc, thông báo hộp thư + push, socket, email `.ics`, đồng bộ nhóm chat, bump
 * quyền. Mọi bước IDEMPOTENT (job retry tối đa 3 lần): `notify()` theo `dedupeKey`, job con theo `jobId` tất định, socket trùng vô hại.
 */
export class MeetingEventHandler {
  constructor(
    private readonly d: MeetingDeps,
    private readonly jobs: MeetingJobsPort,
    private readonly notifyFn: NotifyFn,
    /** (p2-05) Phần phòng họp: started/ended/lock-changed và loại người khỏi phòng LIVE. Bỏ trống ở test cũ không cần phòng. */
    private readonly room?: MeetingRoomEventHandler,
    /** (p2-06) Biên bản & ghi hình: ended (dừng ghi, cập nhật thẻ, nhắc biên bản), recap-published, recording-ready. */
    private readonly recapRecording?: MeetingRecapRecordingEvents
  ) {}

  async handle(p: MeetingEventPayload): Promise<void> {
    const meeting = await this.d.repo.findById(p.meetingId, { includeDeleted: true });
    if (!meeting) return;
    const attendees = await this.d.repo.findActiveAttendees(p.meetingId);
    switch (p.event) {
      case "created":
        await this.onCreated(meeting, attendees, p);
        break;
      case "updated":
        await this.onUpdated(meeting, attendees, p);
        break;
      case "cancelled":
        await this.onCancelled(meeting, attendees, p);
        break;
      case "deleted":
        this.emitCancelled(meeting, attendees.map((a) => a.userId), p.version, false);
        await this.jobs.enqueueConversationSync({ meetingId: meeting.id, version: p.version, archive: true });
        break;
      case "attendees-changed":
        await this.onAttendeesChanged(meeting, attendees, p);
        break;
      case "roles-changed":
      case "host-transferred":
        await this.onRolesChanged(meeting, attendees, p);
        break;
      case "started":
        await this.room?.onStarted(meeting, attendees, p);
        break;
      case "ended":
        await this.room?.onEnded(meeting, p);
        break;
      case "lock-changed":
        this.room?.onLockChanged(meeting, p);
        break;
    }
    await this.bump(meeting.id);
    await this.recapRecording?.handle(p);
    for (const sink of sinks.values()) await sink(p);
  }

  private async bump(meetingId: string): Promise<void> {
    const scope: ScopeRef = { type: "MEETING", id: meetingId };
    try {
      await permissionService.bumpVersion(scope);
    } catch {
      // cache quyền tự hết hạn (TTL 60 s) — không làm hỏng job
    }
  }

  private async scheduleReminders(m: MeetingEntity): Promise<void> {
    if (m.status !== "SCHEDULED") return;
    for (const minutes of m.reminderMinutes) await this.jobs.scheduleReminder({ meetingId: m.id, minutes, startAt: m.startAt });
  }

  private async onCreated(m: MeetingEntity, attendees: AttendeeEntity[], p: Extract<MeetingEventPayload, { event: "created" }>): Promise<void> {
    await this.scheduleReminders(m);
    const invited = attendees.filter((a) => a.userId !== m.hostId);
    await this.notifyInvited(m, invited, p.version, m.hostId);
    for (const a of invited) await this.jobs.enqueueIcsSend({ meetingId: m.id, userId: a.userId, kind: "REQUEST", sequence: p.version, updated: false });
    if (m.createChatGroup) await this.jobs.enqueueConversationSync({ meetingId: m.id, version: p.version });
  }

  private async onUpdated(m: MeetingEntity, attendees: AttendeeEntity[], p: Extract<MeetingEventPayload, { event: "updated" }>): Promise<void> {
    // Đặt lại nhắc: xoá theo (mốc phút CŨ, startAt CŨ) rồi đặt theo giá trị mới — giữ nguyên giờ/mốc thì cùng jobId (không nhân đôi).
    const oldStartAt = new Date(p.oldStartAt);
    for (const minutes of p.oldReminderMinutes) await this.jobs.cancelReminder({ meetingId: m.id, minutes, startAt: oldStartAt });
    await this.scheduleReminders(m);

    const audience = attendees.filter((a) => a.userId !== p.actorId);
    if (p.notifyRelevant) {
      await this.notifyFn({
        type: "meeting.updated",
        scope: scopeOf(m),
        workspaceId: m.workspaceId,
        actorId: p.actorId ?? undefined,
        source: { type: "Meeting", id: `meeting-updated:${m.id}:v${p.version}` },
        refs: { meetingId: m.id, workspaceId: m.workspaceId, version: p.version },
        recipients: audience.map((a) => ({ userId: a.userId })),
        dedupeKey: `meeting-updated:${m.id}:v${p.version}`,
      });
    }
    this.d.emitter.toUsers(attendees.map((a) => a.userId), SocketEvent.MEETING_UPDATED, {
      meetingId: m.id,
      version: p.version,
      changedFields: p.changedFields,
      status: m.status,
      startAt: m.startAt.toISOString(),
      endAt: m.endAt.toISOString(),
    });
    this.d.emitter.toRoom(ROOM.meeting(m.id), SocketEvent.MEETING_UPDATED, { meetingId: m.id, version: p.version, changedFields: p.changedFields, status: m.status, startAt: m.startAt.toISOString(), endAt: m.endAt.toISOString() });
    if (p.icsRelevant) {
      for (const a of audience) await this.jobs.enqueueIcsSend({ meetingId: m.id, userId: a.userId, kind: "REQUEST", sequence: p.version, updated: true });
    }
  }

  private async onCancelled(m: MeetingEntity, attendees: AttendeeEntity[], p: Extract<MeetingEventPayload, { event: "cancelled" }>): Promise<void> {
    for (const minutes of p.oldReminderMinutes) await this.jobs.cancelReminder({ meetingId: m.id, minutes, startAt: m.startAt });
    const audience = attendees.filter((a) => a.userId !== p.actorId);
    await this.notifyFn({
      type: "meeting.cancelled",
      scope: scopeOf(m),
      workspaceId: m.workspaceId,
      actorId: p.actorId ?? undefined,
      source: { type: "Meeting", id: `meeting-cancelled:${m.id}:v${p.version}` },
      refs: { meetingId: m.id, workspaceId: m.workspaceId },
      recipients: audience.map((a) => ({ userId: a.userId })),
      dedupeKey: `meeting-cancelled:${m.id}:v${p.version}`,
    });
    this.emitCancelled(m, attendees.map((a) => a.userId), p.version, p.byAdmin);
    for (const a of audience) await this.jobs.enqueueIcsSend({ meetingId: m.id, userId: a.userId, kind: "CANCEL", sequence: p.version, updated: false });
    await this.jobs.enqueueConversationSync({ meetingId: m.id, version: p.version, archive: true });
  }

  private emitCancelled(m: MeetingEntity, userIds: string[], version: number, byAdmin: boolean): void {
    const payload = { meetingId: m.id, version, ...(m.cancelReason ? { cancelReason: m.cancelReason } : {}), byAdmin };
    this.d.emitter.toUsers(userIds, SocketEvent.MEETING_CANCELLED, payload);
    this.d.emitter.toRoom(ROOM.meeting(m.id), SocketEvent.MEETING_CANCELLED, payload);
  }

  private async notifyInvited(m: MeetingEntity, invited: AttendeeEntity[], version: number, actorId: string | null): Promise<void> {
    if (invited.length === 0) return;
    await this.notifyFn({
      type: "meeting.invited",
      scope: scopeOf(m),
      workspaceId: m.workspaceId,
      actorId: actorId ?? undefined,
      source: { type: "Meeting", id: `meeting-invited:${m.id}:v${version}` },
      refs: { meetingId: m.id, workspaceId: m.workspaceId, startAt: m.startAt.toISOString() },
      recipients: invited.map((a) => ({ userId: a.userId })),
      dedupeKey: `meeting-invited:${m.id}:v${version}`,
    });
    for (const a of invited) {
      this.d.emitter.toUsers([a.userId], SocketEvent.MEETING_INVITED, {
        meetingId: m.id,
        workspaceId: m.workspaceId,
        title: m.title,
        startAt: m.startAt.toISOString(),
        endAt: m.endAt.toISOString(),
        hostId: m.hostId,
        role: a.role,
        version,
      });
    }
  }

  private async onAttendeesChanged(m: MeetingEntity, attendees: AttendeeEntity[], p: Extract<MeetingEventPayload, { event: "attendees-changed" }>): Promise<void> {
    const addedIds = new Set(p.added.map((a) => a.userId));
    // Vào qua link (p2-05): chỉ đồng bộ nhóm chat/điểm danh — KHÔNG "được mời họp" (push/socket/.ics) vì họ đang ở trong phòng.
    if (!p.viaLink) {
      await this.notifyInvited(m, attendees.filter((a) => addedIds.has(a.userId)), p.version, p.actorId);
      if (m.status === "SCHEDULED" || m.status === "LIVE") {
        for (const userId of addedIds) await this.jobs.enqueueIcsSend({ meetingId: m.id, userId, kind: "REQUEST", sequence: p.version, updated: false });
      }
    }
    if (p.removed.length > 0) {
      await this.notifyFn({
        type: "meeting.removed",
        scope: scopeOf(m),
        workspaceId: m.workspaceId,
        actorId: p.actorId ?? undefined,
        source: { type: "Meeting", id: `meeting-removed:${m.id}:v${p.version}` },
        refs: { meetingId: m.id, workspaceId: m.workspaceId },
        recipients: p.removed.map((userId) => ({ userId })),
        dedupeKey: `meeting-removed:${m.id}:v${p.version}`,
      });
      for (const userId of p.removed) {
        const payload = { meetingId: m.id, userId, version: p.version };
        this.d.emitter.toUsers([userId], SocketEvent.MEETING_ATTENDEE_REMOVED, payload);
        this.d.emitter.toRoom(ROOM.meeting(m.id), SocketEvent.MEETING_ATTENDEE_REMOVED, payload);
        this.d.emitter.leaveRooms([userId], [ROOM.meeting(m.id)]);
        await this.jobs.enqueueIcsSend({ meetingId: m.id, userId, kind: "CANCEL", sequence: p.version, updated: false });
      }
    }
    if (p.removed.length > 0) await this.room?.onAttendeesRemoved(m, p.removed);
    if (m.createChatGroup || m.conversationId) await this.jobs.enqueueConversationSync({ meetingId: m.id, version: p.version });
  }

  private async onRolesChanged(m: MeetingEntity, attendees: AttendeeEntity[], p: Extract<MeetingEventPayload, { event: "roles-changed" | "host-transferred" }>): Promise<void> {
    const affected = p.event === "host-transferred" ? [p.toUserId] : p.userIds;
    await this.notifyFn({
      type: "meeting.role-changed",
      scope: scopeOf(m),
      workspaceId: m.workspaceId,
      actorId: (p.event === "host-transferred" ? p.fromUserId : p.actorId) ?? undefined,
      source: { type: "Meeting", id: `meeting-role:${m.id}:v${p.version}` },
      refs: { meetingId: m.id, workspaceId: m.workspaceId },
      recipients: affected.map((userId) => ({ userId })),
      dedupeKey: `meeting-role:${m.id}:v${p.version}`,
    });
    const payload = { meetingId: m.id, version: p.version, changedFields: p.event === "host-transferred" ? ["hostId"] : ["roles"], status: m.status };
    this.d.emitter.toUsers(attendees.map((a) => a.userId), SocketEvent.MEETING_UPDATED, payload);
    this.d.emitter.toRoom(ROOM.meeting(m.id), SocketEvent.MEETING_UPDATED, payload);
    await this.room?.onRolesChanged(m, p.event === "host-transferred" ? [p.fromUserId, p.toUserId] : p.userIds);
    if (m.createChatGroup || m.conversationId) await this.jobs.enqueueConversationSync({ meetingId: m.id, version: p.version });
  }
}
