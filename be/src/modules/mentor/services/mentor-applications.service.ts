import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import type { MentorApplication, MentorPost } from "../entities/mentor.interface";
import type { ApplyDto, ListApplicationsQueryDto, RejectDto } from "../dtos";
import { DuplicateApplicationError } from "../repositories/mentor-application.repository.interface";
import { mentorErrors } from "../mentor.errors";
import type { MentorDeps } from "./mentor.deps";
import { assertWorkspaceAdmin } from "./mentor-access";
import { MENTOR_NOTIFICATION_TYPES } from "./mentor-notifications";
import { loadLookups, toApplicationDto, workspaceRef, type MentorApplicationDto, type MyApplicationDto } from "./mentor-presenter";

/** Trạng thái membership KHÔNG được ứng tuyển (README §2 "Ai được ứng tuyển"). */
const BLOCKED_MEMBERSHIP = new Set(["ACTIVE", "PENDING", "BANNED"]);

/** Ứng tuyển / rút / từ chối / danh sách đơn (be.md §4-§5). Chấp nhận ở `MentorAcceptService`. */
export class MentorApplicationsService {
  constructor(private readonly d: MentorDeps) {}

  async apply(user: AuthUser, postId: string, dto: ApplyDto): Promise<MentorApplicationDto> {
    const post = await this.d.posts.findById(postId);
    if (!post || post.hiddenAt) throw mentorErrors.notFound();
    if (post.status !== "OPEN" || post.expiresAt <= this.d.now()) throw mentorErrors.postNotOpen();
    // IR-23 — thành viên/khách đang hoạt động, đang chờ duyệt hoặc bị chặn khỏi nhóm không ứng tuyển được.
    const membership = await this.d.membership.statusOf(post.workspaceId, user.id);
    if (membership && BLOCKED_MEMBERSHIP.has(membership)) throw mentorErrors.cannotJoin();
    if (await this.d.applications.findByPostAndApplicant(post.id, user.id)) throw mentorErrors.alreadyApplied();
    const maxPending = LIMITS.mentor.applicationsPendingPerUser;
    if ((await this.d.applications.countPendingByApplicant(user.id)) >= maxPending) throw mentorErrors.tooManyPending(maxPending);

    const admins = (await this.d.directory.adminIds(post.workspaceId)).filter((id) => id !== user.id);
    let created: MentorApplication;
    try {
      created = await this.d.tx.run(async (tx) => {
        const app = await this.d.applications.create(tx, {
          postId: post.id,
          workspaceId: post.workspaceId,
          applicantId: user.id,
          message: dto.message,
          portfolioUrl: dto.portfolioUrl ?? null,
        });
        await this.d.posts.incrementApplicants(tx, post.id);
        if (admins.length > 0) {
          await this.d.notifier.notify(tx, {
            type: MENTOR_NOTIFICATION_TYPES.APPLICATION,
            actorId: user.id,
            scope: { type: "WORKSPACE", id: post.workspaceId },
            workspaceId: post.workspaceId,
            source: { type: "MentorApplication", id: app.id },
            refs: { workspaceId: post.workspaceId, postId: post.id, applicationId: app.id },
            recipients: admins.map((userId) => ({ userId })),
            dedupeKey: `mentor.application:${app.id}`,
          });
        }
        return app;
      });
    } catch (err) {
      // IR-21 — hai lượt ứng tuyển đua nhau: unique `(postId, applicantId)` chặn lượt sau (transaction đã huỷ, không ghi gì).
      if (err instanceof DuplicateApplicationError) throw mentorErrors.alreadyApplied();
      throw err;
    }
    return toApplicationDto(created, await loadLookups(this.d.directory, [], [user.id]));
  }

  async withdraw(user: AuthUser, applicationId: string): Promise<MentorApplicationDto> {
    const app = await this.d.applications.findById(applicationId);
    if (!app || app.applicantId !== user.id) throw mentorErrors.notFound();
    if (app.status !== "PENDING") throw mentorErrors.applicationNotPending();
    const ok = await this.d.tx.run((tx) => this.d.applications.transition(tx, app.id, ["PENDING"], { status: "WITHDRAWN" }));
    if (!ok) throw mentorErrors.applicationNotPending();
    return this.present(app.id);
  }

  async reject(user: AuthUser, applicationId: string, dto: RejectDto): Promise<MentorApplicationDto> {
    const app = await this.d.applications.findById(applicationId);
    if (!app) throw mentorErrors.notFound();
    await assertWorkspaceAdmin(this.d.access, user, app.workspaceId);
    if (app.status !== "PENDING") throw mentorErrors.applicationNotPending();
    const now = this.d.now();
    await this.d.tx.run(async (tx) => {
      const ok = await this.d.applications.transition(tx, app.id, ["PENDING"], {
        status: "REJECTED",
        reviewedBy: user.id,
        reviewedAt: now,
        rejectReason: dto.reason && dto.reason.length > 0 ? dto.reason : null,
      });
      if (!ok) throw mentorErrors.applicationNotPending();
      await this.d.notifier.notify(tx, {
        type: MENTOR_NOTIFICATION_TYPES.REJECTED,
        actorId: user.id,
        scope: null,
        workspaceId: app.workspaceId,
        source: { type: "MentorApplication", id: app.id },
        refs: { workspaceId: app.workspaceId, postId: app.postId, applicationId: app.id },
        recipients: [{ userId: app.applicantId }],
        dedupeKey: `mentor.rejected:${app.id}`,
      });
    });
    return this.present(app.id);
  }

  async listForPost(user: AuthUser, postId: string, query: ListApplicationsQueryDto): Promise<{ data: MentorApplicationDto[]; nextCursor: string | null }> {
    const post = await this.d.posts.findById(postId);
    if (!post) throw mentorErrors.notFound();
    await assertWorkspaceAdmin(this.d.access, user, post.workspaceId);
    const page = await this.d.applications.listByPost(post.id, query.status, query.cursor, query.limit);
    const lookups = await loadLookups(this.d.directory, [], page.data.map((a) => a.applicantId));
    return { data: page.data.map((a) => toApplicationDto(a, lookups)), nextCursor: page.nextCursor };
  }

  /** `GET /me/mentor/applications` — đơn của tôi + trạng thái bài + đợt cố vấn (khi được chấp nhận, để mở nhóm/nhóm chat). */
  async listMine(user: AuthUser, cursor: string | undefined, limit: number): Promise<{ data: MyApplicationDto[]; nextCursor: string | null }> {
    const page = await this.d.applications.listByApplicant(user.id, cursor, limit);
    const [posts, engagements] = await Promise.all([
      this.d.posts.findByIds([...new Set(page.data.map((a) => a.postId))]),
      this.d.engagements.findByApplicationIds(page.data.filter((a) => a.status === "ACCEPTED").map((a) => a.id)),
    ]);
    const postById = new Map<string, MentorPost>(posts.map((p) => [p.id, p]));
    const engByApp = new Map(engagements.map((e) => [e.applicationId, e]));
    const lookups = await loadLookups(this.d.directory, page.data.map((a) => a.workspaceId), []);
    const data = page.data.map((a): MyApplicationDto => {
      const post = postById.get(a.postId);
      const eng = engByApp.get(a.id);
      return {
        id: a.id,
        status: a.status,
        createdAt: a.createdAt,
        reviewedAt: a.reviewedAt,
        rejectReason: a.rejectReason,
        post: { id: a.postId, title: post?.title ?? "", status: post?.status ?? null, workspace: workspaceRef(a.workspaceId, lookups) },
        engagement: eng ? { id: eng.id, status: eng.status, conversationId: eng.conversationId, endsAt: eng.endsAt } : null,
      };
    });
    return { data, nextCursor: page.nextCursor };
  }

  private async present(applicationId: string): Promise<MentorApplicationDto> {
    const app = await this.d.applications.findById(applicationId);
    if (!app) throw mentorErrors.notFound();
    return toApplicationDto(app, await loadLookups(this.d.directory, [], [app.applicantId]));
  }
}
