import type { AuthUser } from "../../../core/types/express";
import type { MentorPost } from "../entities/mentor.interface";
import { mentorErrors } from "../mentor.errors";
import type { MentorDeps } from "./mentor.deps";
import type { MentorEngagementsService } from "./mentor-engagements.service";
import { MENTOR_NOTIFICATION_TYPES } from "./mentor-notifications";
import { MENTOR_POST_REPORT_TARGET } from "./mentor-report.constants";
import { loadLookups, toEngagementDto, toPostCard, type MentorEngagementDto, type MentorPostCardDto } from "./mentor-presenter";

export interface AdminMentorPostDto extends MentorPostCardDto {
  description: string;
  version: number;
  reportedCount: number;
  pendingCount: number;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  closedAt: Date | null;
}

/**
 * Kiểm duyệt cấp nền tảng (admin.md §2.1/§2.2): xem bài, ẩn/khôi phục (đóng báo cáo mở), số liệu nhóm, kết thúc đợt cấp nền tảng.
 * KHÔNG trả lời nhắn ứng tuyển (dữ liệu giữa hai bên) — chỉ số lượng.
 */
export class MentorAdminService {
  constructor(
    private readonly d: MentorDeps,
    private readonly engagements: Pick<MentorEngagementsService, "endInternal">
  ) {}

  async getPost(postId: string): Promise<AdminMentorPostDto> {
    return this.present(await this.require(postId));
  }

  async hide(admin: AuthUser, postId: string, reason: string): Promise<AdminMentorPostDto> {
    const post = await this.require(postId);
    if (!post.hiddenAt) {
      const now = this.d.now();
      await this.d.posts.setHidden(post.id, { at: now, by: admin.id, reason });
      await this.d.tx.run(async (tx) => {
        await this.d.applications.expirePendingByPost(tx, post.id, now);
        await this.d.notifier.notify(tx, {
          type: MENTOR_NOTIFICATION_TYPES.POST_HIDDEN,
          scope: { type: "WORKSPACE", id: post.workspaceId },
          workspaceId: post.workspaceId,
          source: { type: "MentorPost", id: post.id },
          refs: { workspaceId: post.workspaceId, postId: post.id },
          recipients: [{ userId: post.createdBy }],
          dedupeKey: `mentor.post-hidden:${post.id}:${now.getTime()}`,
        });
      });
      await this.d.reports.closeOpenByTarget({
        targetType: MENTOR_POST_REPORT_TARGET,
        targetId: post.id,
        actor: { id: admin.id, role: admin.role },
        resolution: "CONTENT_REMOVED",
        level: "PLATFORM",
        reason,
      });
      await this.audit(admin, { action: "mentor.post-hide", post, reason });
    }
    return this.getPost(post.id);
  }

  async unhide(admin: AuthUser, postId: string, reason: string): Promise<AdminMentorPostDto> {
    const post = await this.require(postId);
    if (post.hiddenAt) {
      await this.d.posts.setHidden(post.id, null);
      await this.audit(admin, { action: "mentor.post-unhide", post, reason });
    }
    return this.getPost(post.id);
  }

  /** Tab `mentor` của drawer workspace — bài + đợt cố vấn (không lời nhắn ứng tuyển). */
  async workspaceOverview(workspaceId: string): Promise<{ posts: AdminMentorPostDto[]; engagements: MentorEngagementDto[] }> {
    const [posts, engagements] = await Promise.all([this.d.posts.listByWorkspace(workspaceId, 50), this.d.engagements.listByWorkspace(workspaceId, undefined, 100)]);
    const lookups = await loadLookups(this.d.directory, [workspaceId], engagements.map((e) => e.mentorId));
    const byId = new Map(posts.map((p) => [p.id, p]));
    return { posts: await this.presentMany(posts), engagements: engagements.map((e) => toEngagementDto(e, byId.get(e.postId), lookups)) };
  }

  async endEngagement(admin: AuthUser, engagementId: string, reason: string): Promise<MentorEngagementDto> {
    const e = await this.d.engagements.findById(engagementId);
    if (!e) throw mentorErrors.notFound();
    if (!(await this.engagements.endInternal(e.id, "ENDED_BY_PLATFORM", admin.id))) throw mentorErrors.engagementEnded();
    await this.d.audit.record({
      actorId: admin.id,
      actorRole: admin.role,
      action: "mentor.engagement-end-platform",
      targetType: "MentorEngagement",
      targetId: e.id,
      workspaceId: e.workspaceId,
      reason,
    });
    const [fresh, post] = await Promise.all([this.d.engagements.findById(e.id), this.d.posts.findById(e.postId)]);
    const lookups = await loadLookups(this.d.directory, [e.workspaceId], [e.mentorId]);
    return toEngagementDto(fresh ?? e, post ?? undefined, lookups);
  }

  private audit(admin: AuthUser, { action, post, reason }: { action: string; post: MentorPost; reason: string }): Promise<void> {
    return this.d.audit.record({ actorId: admin.id, actorRole: admin.role, action, targetType: "MentorPost", targetId: post.id, workspaceId: post.workspaceId, reason });
  }

  private async require(postId: string): Promise<MentorPost> {
    const post = await this.d.posts.findById(postId);
    if (!post) throw mentorErrors.notFound();
    return post;
  }

  private async present(post: MentorPost): Promise<AdminMentorPostDto> {
    const [dto] = await this.presentMany([post]);
    return dto;
  }

  private async presentMany(posts: MentorPost[]): Promise<AdminMentorPostDto[]> {
    const [pending, lookups] = await Promise.all([
      this.d.applications.countPendingByPosts(posts.map((p) => p.id)),
      loadLookups(this.d.directory, posts.map((p) => p.workspaceId), posts.map((p) => p.createdBy)),
    ]);
    return posts.map((p) => ({
      ...toPostCard(p, lookups, undefined),
      description: p.description,
      version: p.version,
      reportedCount: p.reportedCount,
      pendingCount: pending[p.id] ?? 0,
      hiddenAt: p.hiddenAt,
      hiddenReason: p.hiddenReason,
      closedAt: p.closedAt,
    }));
  }
}
