import { createContextLogger } from "../../../infrastructure/logger";
import type { GuestRevokeReason } from "../../../shared/ports/workspace-membership.port";
import type { MentorEndReason, MentorEngagement } from "../entities/mentor.interface";
import type { MentorDeps } from "./mentor.deps";
import type { MentorAcceptedPayload, MentorEndedPayload } from "./mentor-events";
import { MENTOR_NOTIFICATION_TYPES } from "./mentor-notifications";

const log = createContextLogger({ service: "MentorEffects" });

const REVOKE_REASON: Record<MentorEndReason, GuestRevokeReason> = {
  EXPIRED: "EXPIRED",
  LEFT_BY_MENTOR: "LEFT",
  ENDED_BY_OWNER: "REMOVED",
  MEMBERSHIP_REVOKED: "REMOVED",
  WORKSPACE_ARCHIVED: "REMOVED",
  ENDED_BY_PLATFORM: "REMOVED",
};

/**
 * Việc SAU commit (consumer outbox, be.md §7) — mọi bước idempotent vì job có thể chạy lại:
 *  - `mentor.accepted-effects`: tạo nhóm chat (khoá `mentor:<engagementId>`), gắn `conversationId`, tin hệ thống cố vấn tham gia, thông báo.
 *  - `mentor.ended-effects`: gỡ cố vấn khỏi nhóm chat, thu hồi khách (revoke lặp vô hại), thông báo.
 */
export class MentorEffectsService {
  constructor(private readonly d: MentorDeps) {}

  async onAccepted(payload: MentorAcceptedPayload): Promise<void> {
    const e = await this.d.engagements.findById(payload.engagementId);
    if (!e || e.status !== "ACTIVE") return; // đã kết thúc trước khi job chạy — không tạo nhóm chat/không báo "được chấp nhận"
    const post = await this.d.posts.findById(e.postId);
    let conversationId = e.conversationId;
    if (payload.createConversation && !conversationId) {
      const group = await this.d.conversations.createGroup({
        workspaceId: e.workspaceId,
        title: `Cố vấn · ${post?.title ?? ""}`.trim(),
        ownerId: e.acceptedBy,
        memberIds: [...(post ? [post.createdBy] : []), ...payload.includeMemberIds],
        guestIds: [e.mentorId],
        dedupeKey: `mentor:${e.id}`,
      });
      await this.d.engagements.setConversation(e.id, group.conversationId);
      conversationId = group.conversationId;
      if (group.memberIds.includes(e.mentorId)) {
        await this.d.systemMessages.mentorJoined(group.conversationId, e.workspaceId, e.mentorId, e.endsAt, `mentor-joined:${e.id}`);
      }
    }
    const refs = { workspaceId: e.workspaceId, postId: e.postId, engagementId: e.id, ...(conversationId && { conversationId }) };
    await this.d.tx.run(async (tx) => {
      await this.d.notifier.notify(tx, {
        type: MENTOR_NOTIFICATION_TYPES.ACCEPTED,
        actorId: e.acceptedBy,
        scope: null,
        workspaceId: e.workspaceId,
        source: { type: "MentorEngagement", id: e.id },
        refs,
        recipients: [{ userId: e.mentorId }],
        dedupeKey: `mentor.accepted:${e.id}:mentor`,
      });
      if (post && post.createdBy !== e.acceptedBy) await this.notifyTeam(tx, e, post.createdBy, MENTOR_NOTIFICATION_TYPES.ACCEPTED, refs, "accepted");
    });
  }

  async onEnded(payload: MentorEndedPayload): Promise<void> {
    const e = await this.d.engagements.findById(payload.engagementId);
    if (!e || e.status !== "ENDED") return;
    const reason = REVOKE_REASON[e.endedReason ?? "ENDED_BY_OWNER"];
    if (e.conversationId) await this.d.conversations.removeMember(e.conversationId, e.mentorId);
    await this.d.membership.revokeGuest(e.workspaceId, e.mentorId, reason);
    if (e.conversationId) await this.postMentorLeft(e, e.conversationId, reason);

    const post = await this.d.posts.findById(e.postId);
    const refs = { workspaceId: e.workspaceId, postId: e.postId, engagementId: e.id, reason: e.endedReason };
    await this.d.tx.run(async (tx) => {
      if (e.endedBy !== e.mentorId) {
        await this.d.notifier.notify(tx, {
          type: MENTOR_NOTIFICATION_TYPES.ENDED,
          actorId: e.endedBy ?? undefined,
          scope: null,
          workspaceId: e.workspaceId,
          source: { type: "MentorEngagement", id: e.id },
          refs,
          recipients: [{ userId: e.mentorId }],
          dedupeKey: `mentor.ended:${e.id}:mentor`,
        });
      }
      if (post && e.endedBy !== post.createdBy) await this.notifyTeam(tx, e, post.createdBy, MENTOR_NOTIFICATION_TYPES.ENDED, refs, "ended");
    });
  }

  /**
   * Tin `MENTOR_LEFT` vào nhóm chat cố vấn (idempotent theo `dedupeKey`). Đặt SAU khi đã gỡ cố vấn + thu hồi khách và chỉ là thông tin phụ: nhóm chat có thể đã
   * giải tán/lưu trữ — lỗi ở đây chỉ ghi log, KHÔNG được chặn thông báo kết thúc (job retry sẽ không làm gì thêm cho phần đã xong).
   */
  private async postMentorLeft(e: MentorEngagement, conversationId: string, reason: GuestRevokeReason): Promise<void> {
    try {
      await this.d.systemMessages.mentorLeft(conversationId, e.workspaceId, e.mentorId, reason, `mentor-left:${e.id}`);
    } catch (err) {
      log.warn("Không đăng được tin MENTOR_LEFT", { engagementId: e.id, conversationId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private notifyTeam(
    tx: Parameters<MentorDeps["notifier"]["notify"]>[0],
    e: MentorEngagement,
    userId: string,
    type: string,
    refs: Record<string, unknown>,
    tag: string
  ): Promise<void> {
    return this.d.notifier.notify(tx, {
      type,
      actorId: e.mentorId,
      scope: { type: "WORKSPACE", id: e.workspaceId },
      workspaceId: e.workspaceId,
      source: { type: "MentorEngagement", id: e.id },
      refs,
      recipients: [{ userId }],
      dedupeKey: `mentor.${tag}:${e.id}:team`,
    });
  }
}
