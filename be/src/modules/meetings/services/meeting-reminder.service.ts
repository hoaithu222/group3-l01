import { LIMITS } from "../../../core/constants/limits";
import type { SystemMessagePostInput, SystemMessageUpdateInput } from "../../messages/public";
import type { MeetingDeps } from "./meeting.deps";
import type { MeetingJobsPort } from "./meeting-jobs.port";
import type { NotifyFn } from "./meeting-event.handler";

export interface SystemMessagePoster {
  post(input: SystemMessagePostInput): Promise<unknown>;
  /** (p2-06) Sửa `systemPayload` của tin hệ thống đã đăng (thẻ biên bản/thẻ họp); trả `null` khi chưa có tin. Bản giả cũ không cần cài. */
  updatePayload?(input: SystemMessageUpdateInput): Promise<unknown>;
}

export interface ReminderJobData {
  meetingId: string;
  minutes: number;
  startAtMs: number;
}

/** Nhắc họp (be.md §7): processor `meeting.reminder` + cron `meeting.reminder-reconcile` đặt lại job thiếu khi Redis mất dữ liệu. */
export class MeetingReminderService {
  constructor(
    private readonly d: MeetingDeps,
    private readonly jobs: MeetingJobsPort,
    private readonly notifyFn: NotifyFn,
    private readonly messages: SystemMessagePoster
  ) {}

  /**
   * Chạy khi tới mốc nhắc. Kiểm lại trạng thái (job có thể cũ): chỉ nhắc khi cuộc họp còn `SCHEDULED`, chưa xoá, `startAt` khớp mốc
   * lúc đặt và mốc phút còn trong danh sách — nếu không, no-op. `dedupeKey` gắn `(id, phút, startAt)` nên 2 worker/2 job chồng nhau
   * vẫn chỉ tạo MỘT thông báo và MỘT tin nhắc (MT-07). Trả số người được nhắc (0 = bỏ qua).
   */
  async fire(job: ReminderJobData): Promise<number> {
    const m = await this.d.repo.findById(job.meetingId);
    if (!m || m.status !== "SCHEDULED" || m.startAt.getTime() !== job.startAtMs || !m.reminderMinutes.includes(job.minutes)) return 0;
    const attendees = await this.d.repo.findActiveAttendees(m.id);
    if (attendees.length === 0) return 0;

    const key = `meeting-reminder:${m.id}:${job.minutes}:${job.startAtMs}`;
    const viaChat = (m.notifyVia === "CHAT" || m.notifyVia === "BOTH") && !!m.conversationId;
    // `notifyVia = CHAT` mà không có nhóm chat họp → rơi về APP (MT-16).
    const viaApp = m.notifyVia === "APP" || m.notifyVia === "BOTH" || !viaChat;
    if (viaApp) {
      await this.notifyFn({
        type: "meeting.reminder",
        scope: { type: "MEETING", id: m.id },
        workspaceId: m.workspaceId,
        source: { type: "Meeting", id: key },
        refs: { meetingId: m.id, workspaceId: m.workspaceId, startAt: m.startAt.toISOString(), minutesBefore: job.minutes },
        recipients: attendees.map((a) => ({ userId: a.userId })),
        dedupeKey: key,
      });
    }
    if (viaChat && m.conversationId) {
      await this.messages.post({
        scopeType: "CONVERSATION",
        scopeId: m.conversationId,
        workspaceId: m.workspaceId,
        systemType: "MEETING_REMINDER",
        payload: { meetingId: m.id, title: m.title, startAt: m.startAt, minutesBefore: job.minutes },
        dedupeKey: key,
      });
    }
    return attendees.length;
  }

  /** Quét cuộc họp SCHEDULED bắt đầu trong `reminderReconcileHorizonHours` tới, đặt lại job nhắc còn thiếu (idempotent theo jobId). */
  async reconcile(): Promise<number> {
    const now = this.d.now();
    const horizon = new Date(now.getTime() + LIMITS.meeting.reminderReconcileHorizonHours * 3_600_000);
    const meetings = await this.d.repo.findScheduledBetween(now, horizon, 1000);
    for (const m of meetings) {
      for (const minutes of m.reminderMinutes) await this.jobs.scheduleReminder({ meetingId: m.id, minutes, startAt: m.startAt });
    }
    return meetings.length;
  }
}
