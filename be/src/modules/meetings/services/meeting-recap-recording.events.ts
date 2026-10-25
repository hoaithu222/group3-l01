import { Prisma } from "@prisma/client";
import { LIMITS } from "../../../core/constants/limits";
import type { OutboxEventInput } from "../../../infrastructure/queue";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import type { AttendeeEntity, MeetingEntity } from "../entities/meeting.interface";
import type { NotifyFn } from "./meeting-event.handler";
import type { MeetingEventPayload } from "./meeting-events";
import type { SystemMessagePoster } from "./meeting-reminder.service";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { MeetingRecordingService } from "./meeting-recording.service";
import { recapExcerpt } from "./recap-content";
import { recordingOutbox } from "./recording-outbox";
import type { RecordingSignals } from "./recording-signals";

type Ended = Extract<MeetingEventPayload, { event: "ended" }>;
type RecapPublished = Extract<MeetingEventPayload, { event: "recap-published" }>;
type RecordingReady = Extract<MeetingEventPayload, { event: "recording-ready" }>;

const isHostLike = (a: AttendeeEntity): boolean => a.role === "HOST" || a.role === "CO_HOST";

/**
 * Phần biên bản/ghi hình của sink outbox `meeting.events` (p2-06): sau khi họp kết thúc (dừng ghi hình, cập nhật thẻ "đã bắt đầu", nhắc viết biên bản),
 * sau khi công bố biên bản (thẻ + socket + push), sau khi bản ghi READY (thẻ + hộp thư + socket). Mọi bước IDEMPOTENT (job retry ≤ 3): `notify()` và tin hệ thống
 * theo `dedupeKey`, sửa thẻ theo payload hiện tại, socket trùng vô hại, hàng outbox hẹn giờ bắt P2002 khi ghi lại.
 */
export class MeetingRecapRecordingEvents {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly notifyFn: NotifyFn,
    private readonly messages: SystemMessagePoster,
    private readonly recordings: MeetingRecordingService,
    private readonly signals: RecordingSignals
  ) {}

  async handle(p: MeetingEventPayload): Promise<void> {
    if (p.event === "ended") await this.onEnded(p);
    else if (p.event === "recap-published") await this.onRecapPublished(p);
    else if (p.event === "recording-ready") await this.onRecordingReady(p);
  }

  /** Hàng outbox hẹn giờ ghi bằng transaction riêng; trùng `dedupeKey` (handler chạy lại) là bình thường → bỏ qua. Catch NGOÀI transaction (đã huỷ hẳn). */
  private async scheduleOnce(event: OutboxEventInput): Promise<void> {
    try {
      await this.d.tx.run((tx) => this.d.outbox.add(tx, event));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
      throw err;
    }
  }

  private async attendeesOf(meeting: MeetingEntity): Promise<AttendeeEntity[]> {
    return this.d.repo.findActiveAttendees(meeting.id);
  }

  // ── Họp kết thúc ───────────────────────────────────────────────────────────

  private async onEnded(p: Ended): Promise<void> {
    const meeting = await this.d.repo.findById(p.meetingId, { includeDeleted: true });
    if (!meeting) return;
    // Dừng ghi hình (egress tự dừng khi phòng đóng nhưng vẫn cần chốt STOPPING/lý do `MEETING_ENDED`); idempotent nếu webhook đã chốt trước.
    await this.recordings.stopBySystem({ meetingId: meeting.id }, "MEETING_ENDED");
    await this.closeStartedCard(meeting, p);
    await this.remindRecap(meeting);
  }

  /** Thẻ "Cuộc họp đã bắt đầu" → "đã kết thúc · N phút" (sửa `systemPayload` tại chỗ, `message:updated`); chưa có thẻ/nhóm chat → bỏ qua. */
  private async closeStartedCard(meeting: MeetingEntity, p: Ended): Promise<void> {
    if (!p.callId || !meeting.conversationId || !this.messages.updatePayload) return;
    const call = await this.d.calls.findCall(p.callId);
    const endedAt = meeting.endedAt ?? call?.endedAt ?? this.d.now();
    const durationSec = call?.durationSec ?? Math.max(0, Math.round((endedAt.getTime() - (call?.startedAt ?? endedAt).getTime()) / 1000));
    await this.messages.updatePayload({ dedupeKey: `sys:meeting-started:${p.callId}`, systemType: "MEETING_STARTED", payload: { meetingId: meeting.id, title: meeting.title, startedAt: call?.startedAt, endedAt, durationSec } });
  }

  /** `recapRequired` + chưa công bố → hộp thư cho chủ trì/đồng chủ trì NGAY và hàng hẹn giờ nhắc lại sau `reminderAfterHours` (một lần). */
  private async remindRecap(meeting: MeetingEntity): Promise<void> {
    if (!meeting.recapRequired || meeting.status !== "ENDED" || !meeting.endedAt) return;
    if ((await this.d.recaps.findByMeetingId(meeting.id))?.publishedAt) return;
    const hosts = (await this.attendeesOf(meeting)).filter(isHostLike);
    const endedAtMs = meeting.endedAt.getTime();
    if (hosts.length > 0) {
      const key = `meeting-recap-required:${meeting.id}:${endedAtMs}`;
      await this.notifyFn({ type: "meeting.recap-required", scope: { type: "MEETING", id: meeting.id }, workspaceId: meeting.workspaceId, source: { type: "Meeting", id: key }, refs: { meetingId: meeting.id, workspaceId: meeting.workspaceId }, recipients: hosts.map((a) => ({ userId: a.userId })), dedupeKey: key });
    }
    await this.scheduleOnce(recordingOutbox.recapReminder(meeting.id, endedAtMs, new Date(endedAtMs + LIMITS.meetingRecap.reminderAfterHours * 3_600_000)));
  }

  /** Job `meeting.recap-reminder`: kiểm lại (họp đã bắt đầu lại/xoá/đã công bố → không nhắc) rồi nhắc chủ trì (hộp thư + push). Trả số người được nhắc. */
  async fireRecapReminder(job: { meetingId: string; endedAtMs: number }): Promise<number> {
    const meeting = await this.d.repo.findById(job.meetingId);
    if (!meeting || meeting.status !== "ENDED" || !meeting.recapRequired || meeting.endedAt?.getTime() !== job.endedAtMs) return 0;
    if ((await this.d.recaps.findByMeetingId(meeting.id))?.publishedAt) return 0;
    const hosts = (await this.attendeesOf(meeting)).filter(isHostLike);
    if (hosts.length === 0) return 0;
    const key = `meeting-recap-reminder:${meeting.id}:${job.endedAtMs}`;
    await this.notifyFn({ type: "meeting.recap-reminder", scope: { type: "MEETING", id: meeting.id }, workspaceId: meeting.workspaceId, source: { type: "Meeting", id: key }, refs: { meetingId: meeting.id, workspaceId: meeting.workspaceId, kind: "RECAP" }, recipients: hosts.map((a) => ({ userId: a.userId })), dedupeKey: key });
    return hosts.length;
  }

  // ── Biên bản công bố ───────────────────────────────────────────────────────

  private async onRecapPublished(p: RecapPublished): Promise<void> {
    const [meeting, recap] = await Promise.all([this.d.repo.findById(p.meetingId, { includeDeleted: true }), this.d.recaps.findByMeetingId(p.meetingId)]);
    if (!meeting || !recap?.publishedAt) return;
    const attendees = await this.attendeesOf(meeting);
    if (meeting.conversationId) {
      const payload = { meetingId: meeting.id, recapId: recap.id, title: meeting.title, excerpt: recapExcerpt(recap.publishedContent ?? ""), attachmentCount: recap.publishedAssetIds.length, publishedVersion: recap.publishedVersion ?? p.version };
      const dedupeKey = `sys:meeting-recap:${meeting.id}`;
      // Một tin/cuộc họp: công bố lại → SỬA payload tại chỗ (không tạo tin mới); chưa có tin → đăng lần đầu và lưu `systemMessageId`.
      const updated = this.messages.updatePayload ? await this.messages.updatePayload({ dedupeKey, systemType: "MEETING_RECAP", payload }) : null;
      if (!updated) {
        const posted = (await this.messages.post({ scopeType: "CONVERSATION", scopeId: meeting.conversationId, workspaceId: meeting.workspaceId, systemType: "MEETING_RECAP", payload, dedupeKey })) as { id?: string } | null;
        if (posted?.id && recap.systemMessageId !== posted.id) await this.d.recaps.setSystemMessageId(recap.id, posted.id);
      }
    }
    const body = { meetingId: meeting.id, recapId: recap.id, publishedVersion: recap.publishedVersion ?? p.version, firstPublish: p.firstPublish };
    this.d.emitter.toRoom(ROOM.meeting(meeting.id), SocketEvent.MEETING_RECAP_PUBLISHED, body);
    this.d.emitter.toUsers(attendees.map((a) => a.userId), SocketEvent.MEETING_RECAP_PUBLISHED, body);
    if (p.firstPublish) {
      const recipients = attendees.filter((a) => a.userId !== p.actorId);
      if (recipients.length > 0) {
        const key = `meeting-recap-published:${meeting.id}`;
        await this.notifyFn({ type: "meeting.recap-published", scope: { type: "MEETING", id: meeting.id }, workspaceId: meeting.workspaceId, actorId: p.actorId, source: { type: "Meeting", id: key }, refs: { meetingId: meeting.id, workspaceId: meeting.workspaceId, recapId: recap.id }, recipients: recipients.map((a) => ({ userId: a.userId })), dedupeKey: key });
      }
    }
  }

  // ── Bản ghi sẵn sàng ───────────────────────────────────────────────────────

  private async onRecordingReady(p: RecordingReady): Promise<void> {
    const [meeting, rec] = await Promise.all([this.d.repo.findById(p.meetingId, { includeDeleted: true }), this.d.recordings.findById(p.recordingId)]);
    if (!meeting || !rec || rec.deletedAt || rec.status !== "READY") return;
    if (meeting.conversationId) {
      await this.messages.post({ scopeType: "CONVERSATION", scopeId: meeting.conversationId, workspaceId: meeting.workspaceId, systemType: "MEETING_RECORDING_READY", payload: { meetingId: meeting.id, recordingId: rec.id, durationSec: rec.durationSec ?? 0 }, dedupeKey: `sys:meeting-recording-ready:${rec.id}` });
    }
    const attendees = await this.attendeesOf(meeting);
    if (attendees.length > 0) {
      const key = `meeting-recording-ready:${rec.id}`;
      await this.notifyFn({ type: "meeting.recording-ready", scope: { type: "MEETING", id: meeting.id }, workspaceId: meeting.workspaceId, source: { type: "MeetingRecording", id: key }, refs: { meetingId: meeting.id, workspaceId: meeting.workspaceId, recordingId: rec.id }, recipients: attendees.map((a) => ({ userId: a.userId })), dedupeKey: key });
    }
    await this.signals.recordingUpdated(meeting, rec);
  }
}
