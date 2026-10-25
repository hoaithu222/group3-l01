import type { AuthUser } from "../../../core/types/express";
import type { GuestChangeHandle } from "../../../shared/ports/workspace-membership.port";
import { MENTOR_DISPLAY_TAG, type MentorApplication, type MentorEngagement, type MentorPost } from "../entities/mentor.interface";
import type { AcceptDto } from "../dtos";
import { mentorErrors } from "../mentor.errors";
import type { MentorDeps } from "./mentor.deps";
import { assertWorkspaceAdmin } from "./mentor-access";
import { acceptedEvent } from "./mentor-events";
import { loadLookups, toEngagementDto, type MentorEngagementDto } from "./mentor-presenter";

const DAY_MS = 86_400_000;

export interface AcceptResult {
  engagement: MentorEngagementDto;
  /** Luôn `null` trong phản hồi — nhóm chat do job `mentor.accepted-effects` tạo sau commit (app theo dõi thông báo `mentor.accepted`). */
  conversationId: string | null;
  skippedChannels: Array<{ channelId: string; reason: string }>;
}

/**
 * `POST /mentor/applications/:id/accept` (be.md §5 "accept") — MỘT transaction: giữ chỗ trên bài bằng CAS `version` (IR-22: hai ADMIN
 * cùng chấp nhận khi `mentorsNeeded=1` → một thắng, một `MENTOR_005`), đơn PENDING → ACCEPTED, membership GUEST có hạn + grant kênh
 * chỉ định (qua `WorkspaceMembershipPort`), tạo `MentorEngagement`, outbox `mentor.accepted` (nhóm chat + tin hệ thống + thông báo).
 */
export class MentorAcceptService {
  constructor(private readonly d: MentorDeps) {}

  async accept(user: AuthUser, applicationId: string, dto: AcceptDto): Promise<AcceptResult> {
    const app = await this.d.applications.findById(applicationId);
    if (!app) throw mentorErrors.notFound();
    await assertWorkspaceAdmin(this.d.access, user, app.workspaceId);
    if (app.status !== "PENDING") throw mentorErrors.applicationNotPending();
    const post = await this.d.posts.findById(app.postId);
    if (!post) throw mentorErrors.notFound();
    const now = this.d.now();
    this.assertPostAccepting(post, dto.expectedPostVersion, now);
    const channelIds = await this.assertChannels(user, post.workspaceId, dto.channelIds);
    const status = await this.d.membership.statusOf(post.workspaceId, app.applicantId);
    if (status === "ACTIVE" || status === "PENDING" || status === "BANNED") throw mentorErrors.cannotJoin();

    const durationDays = dto.durationDays ?? (await this.d.settings.defaultDurationDays());
    const endsAt = new Date(now.getTime() + durationDays * DAY_MS);
    const nextStatus = post.activeEngagements + 1 >= post.mentorsNeeded ? "FULFILLED" : "OPEN";
    const { engagement, handle } = await this.d.tx.run(async (tx) => {
      if (!(await this.d.posts.claimSlot(tx, post.id, dto.expectedPostVersion, nextStatus))) throw mentorErrors.postChanged();
      const reviewed = await this.d.applications.transition(tx, app.id, ["PENDING"], { status: "ACCEPTED", reviewedBy: user.id, reviewedAt: now });
      if (!reviewed) throw mentorErrors.applicationNotPending();
      const grant = await this.d.membership.grantGuestInTx(tx, {
        workspaceId: post.workspaceId,
        userId: app.applicantId,
        expiresAt: endsAt,
        displayTag: MENTOR_DISPLAY_TAG,
        channelIds,
        grantedBy: user.id,
        via: "MENTOR",
      });
      if (!grant.ok) throw mentorErrors.cannotJoin();
      const created = await this.d.engagements.create(tx, {
        postId: post.id,
        applicationId: app.id,
        workspaceId: post.workspaceId,
        mentorId: app.applicantId,
        acceptedBy: user.id,
        channelIds: grant.handle.channelIds,
        startedAt: now,
        endsAt,
        totalDays: durationDays,
      });
      await this.d.outbox.add(
        tx,
        acceptedEvent(created.id, { createConversation: dto.createConversation, includeMemberIds: [...new Set(dto.includeMemberIds)] })
      );
      return { engagement: created, handle: grant.handle };
    });

    await this.afterCommit(user, app, engagement, handle);
    const lookups = await loadLookups(this.d.directory, [post.workspaceId], [app.applicantId]);
    return {
      engagement: toEngagementDto(engagement, post, lookups),
      conversationId: null,
      skippedChannels: handle.skipped.map((s) => ({ channelId: s.channelId, reason: s.reason })),
    };
  }

  /** Bài phải đang nhận: không ẩn, OPEN, chưa hết hạn; `expectedPostVersion` khớp (client vừa xem đúng bản mới nhất). */
  private assertPostAccepting(post: MentorPost, expectedVersion: number, now: Date): void {
    if (post.hiddenAt || post.status === "CLOSED" || post.expiresAt <= now) throw mentorErrors.postNotOpen();
    if (post.status === "FULFILLED" || post.activeEngagements >= post.mentorsNeeded) throw mentorErrors.postChanged(post.version);
    if (post.version !== expectedVersion) throw mentorErrors.postChanged(post.version);
  }

  /** Kênh thuộc nhóm, đang hoạt động; kênh riêng tư → người duyệt phải QUẢN LÝ được kênh (`MENTOR_008`, README §9 bước 4.3). */
  private async assertChannels(user: AuthUser, workspaceId: string, requested: string[]): Promise<string[]> {
    const ids = [...new Set(requested)];
    const briefs = new Map((await this.d.directory.channels(workspaceId, ids)).map((c) => [c.id, c]));
    const invalid: string[] = [];
    for (const id of ids) {
      const ch = briefs.get(id);
      if (!ch || ch.status !== "ACTIVE") invalid.push(id);
      else if (ch.visibility === "PRIVATE" && !(await this.d.access.canManageChannel(user, id))) invalid.push(id);
    }
    if (invalid.length > 0) throw mentorErrors.invalidChannels(invalid);
    return ids;
  }

  private async afterCommit(user: AuthUser, app: MentorApplication, engagement: MentorEngagement, handle: GuestChangeHandle): Promise<void> {
    await this.d.membership.afterGuestChange(handle);
    await this.d.audit.record({
      actorId: user.id,
      actorRole: user.role,
      action: "mentor.accept",
      targetType: "MentorEngagement",
      targetId: engagement.id,
      workspaceId: app.workspaceId,
      metadata: { applicationId: app.id, mentorId: app.applicantId, days: engagement.totalDays, channels: engagement.channelIds.length },
    });
  }
}
