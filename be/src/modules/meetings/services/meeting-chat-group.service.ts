import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { meetError, meetNotFound } from "./meeting-errors";
import type { MeetingConversationSync } from "./meeting-conversation-sync.service";
import type { MeetingRoomAccess } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";

/**
 * "Tạo nhóm chat cho cuộc họp" (app.md `MeetingChatSheet`, README §2 "Chat trong họp"): cuộc họp tạo KHÔNG bật `createChatGroup` thì chủ trì/đồng chủ trì
 * bật ngay trong phòng. Dùng lại đồng bộ nhóm chat của p2-04 (`MeetingConversationSync` — `ensureMeetingConversation` idempotent, CAS `conversationId`),
 * KHÔNG tạo hội thoại riêng. Đã có nhóm chat ⇒ trả nguyên `conversationId`. Người vào qua link được thêm vào nhóm nhờ outbox `attendees-changed { viaLink }`.
 */
export class MeetingChatGroupService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly access: MeetingRoomAccess,
    private readonly sync: MeetingConversationSync
  ) {}

  async ensure(user: AuthUser, meetingId: string): Promise<{ conversationId: string }> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    this.access.assertHostLike(await this.access.load(meeting, user.id));
    if (meeting.conversationId) return { conversationId: meeting.conversationId };
    if (meeting.status === "ENDED" || meeting.status === "CANCELLED") throw meetError(ErrorCode.MEET_009, 409);

    if (!meeting.createChatGroup) await this.d.repo.updateMeeting(undefined, meetingId, undefined, { createChatGroup: true });
    await this.sync.sync({ meetingId });
    const fresh = await this.d.repo.findById(meetingId);
    if (!fresh?.conversationId) throw meetError(ErrorCode.MEET_009, 409);
    return { conversationId: fresh.conversationId };
  }
}
