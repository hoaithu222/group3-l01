import type { ConversationHooks } from "../../../core/permission";
import type { MeetingDeps } from "./meeting.deps";

/**
 * Đồng bộ nhóm chat họp (be.md §7 `meeting.conversation-sync`) qua cổng `ConversationHooks` (p1-05) — module KHÔNG import
 * `conversations`. Idempotent: `ensureMeetingConversation` theo `meetingKey`, `Meeting.conversationId` ghi bằng CAS `null`,
 * `syncMeetingAttendees` diff theo danh sách mong muốn. `archive` (huỷ/xoá cuộc họp) → nhóm chat ARCHIVED (chỉ đọc).
 */
export class MeetingConversationSync {
  constructor(
    private readonly d: MeetingDeps,
    private readonly hooks: () => ConversationHooks | null
  ) {}

  async sync(input: { meetingId: string; archive?: boolean }): Promise<"SYNCED" | "ARCHIVED" | "SKIPPED"> {
    const hooks = this.hooks();
    if (!hooks) throw new Error("ConversationHooks chưa đăng ký trong tiến trình này — job sẽ được thử lại");
    const m = await this.d.repo.findById(input.meetingId, { includeDeleted: true });
    if (!m) return "SKIPPED";

    if (input.archive) {
      if (hooks.archiveMeetingConversation) await hooks.archiveMeetingConversation(m.id);
      return "ARCHIVED";
    }
    if (m.status === "CANCELLED" || m.deletedAt) return "SKIPPED";
    if (!m.createChatGroup && !m.conversationId) return "SKIPPED";

    const attendees = await this.d.repo.findActiveAttendees(m.id);
    let conversationId = m.conversationId;
    if (!conversationId) {
      const created = await hooks.ensureMeetingConversation({
        meetingId: m.id,
        workspaceId: m.workspaceId,
        title: m.title,
        hostId: m.hostId,
        attendeeIds: attendees.filter((a) => a.userId !== m.hostId).map((a) => a.userId),
      });
      conversationId = created.conversationId;
      await this.d.repo.setConversationIfUnset(m.id, conversationId); // CAS `conversationId: null` — job song song chỉ một thắng
    }
    await hooks.syncMeetingAttendees({
      meetingId: m.id,
      hostId: m.hostId,
      coHostIds: attendees.filter((a) => a.role === "CO_HOST").map((a) => a.userId),
      attendeeIds: attendees.filter((a) => a.role === "ATTENDEE").map((a) => a.userId),
    });
    return "SYNCED";
  }
}
