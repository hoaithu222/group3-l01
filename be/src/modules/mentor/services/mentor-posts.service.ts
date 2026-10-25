import { AppError, ValidationError, VersionConflictError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { normalizeSearch } from "../../../core/utils/normalize";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import type { MentorPost, MentorPostPatch } from "../entities/mentor.interface";
import type { CreatePostDto, ListPostsQueryDto, UpdatePostDto } from "../dtos";
import { mentorErrors } from "../mentor.errors";
import type { MentorDeps } from "./mentor.deps";
import { assertWorkspaceAdmin, isWorkspaceAdmin } from "./mentor-access";
import { normalizeSkills, parseSkillsCsv } from "./mentor-skills";
import {
  loadLookups,
  toPostCard,
  type MentorManagedPostDto,
  type MentorPostCardDto,
  type MentorPostDetailDto,
} from "./mentor-presenter";

const DAY_MS = 86_400_000;

/** Bài tìm cố vấn: đăng/sửa/đóng (OWNER/ADMIN), bảng tin công khai (người đã đăng nhập), chi tiết + `myActions` (be.md §4/§5). */
export class MentorPostsService {
  constructor(private readonly d: MentorDeps) {}

  async create(user: AuthUser, workspaceId: string, dto: CreatePostDto): Promise<MentorPostDetailDto> {
    await assertWorkspaceAdmin(this.d.access, user, workspaceId);
    const ws = (await this.d.directory.workspaces([workspaceId])).get(workspaceId);
    if (!ws || ws.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.WS_002], 409, ErrorCode.WS_002);
    const now = this.d.now();
    const max = LIMITS.mentor.postsOpenPerWorkspace;
    if ((await this.d.posts.countOpenByWorkspace(workspaceId, now)) >= max) throw mentorErrors.tooManyOpenPosts(max);

    const { skills, labels } = normalizeSkills(dto.skills);
    const post = await this.d.posts.create({
      workspaceId,
      createdBy: user.id,
      title: dto.title,
      normalizedTitle: normalizeSearch(dto.title),
      description: dto.description,
      skills,
      skillLabels: labels,
      commitmentHoursPerWeek: dto.commitmentHoursPerWeek,
      mentorsNeeded: dto.mentorsNeeded,
      expiresAt: new Date(now.getTime() + dto.expiresInDays * DAY_MS),
    });
    return this.detailOf(user, post);
  }

  async update(user: AuthUser, postId: string, dto: UpdatePostDto): Promise<MentorPostDetailDto> {
    const post = await this.require(postId);
    await assertWorkspaceAdmin(this.d.access, user, post.workspaceId);
    if (post.status === "CLOSED") throw mentorErrors.postNotOpen();
    if (post.version !== dto.expectedVersion) throw new VersionConflictError(post.version);

    const now = this.d.now();
    const patch: MentorPostPatch = {};
    if (dto.title !== undefined) Object.assign(patch, { title: dto.title, normalizedTitle: normalizeSearch(dto.title) });
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.skills !== undefined) {
      const { skills, labels } = normalizeSkills(dto.skills);
      Object.assign(patch, { skills, skillLabels: labels });
    }
    if (dto.commitmentHoursPerWeek !== undefined) patch.commitmentHoursPerWeek = dto.commitmentHoursPerWeek;
    if (dto.expiresInDays !== undefined) patch.expiresAt = new Date(now.getTime() + dto.expiresInDays * DAY_MS);
    if (dto.mentorsNeeded !== undefined) {
      if (dto.mentorsNeeded < post.activeEngagements) {
        throw new ValidationError("Số cố vấn cần không được nhỏ hơn số cố vấn đang hoạt động", { mentorsNeeded: [`≥ ${post.activeEngagements}`] });
      }
      patch.mentorsNeeded = dto.mentorsNeeded;
      patch.status = post.activeEngagements >= dto.mentorsNeeded ? "FULFILLED" : "OPEN";
    }
    if (!(await this.d.posts.updateWithVersion(post.id, dto.expectedVersion, patch))) throw new VersionConflictError(post.version);
    return this.detailOf(user, await this.require(postId));
  }

  /** Đóng bài (không nhận đơn nữa) — đơn đang chờ → EXPIRED; đợt cố vấn đang chạy GIỮ nguyên. */
  async close(user: AuthUser, postId: string): Promise<MentorPostDetailDto> {
    const post = await this.require(postId);
    await assertWorkspaceAdmin(this.d.access, user, post.workspaceId);
    const now = this.d.now();
    await this.d.tx.run(async (tx) => {
      if (await this.d.posts.close(tx, post.id, now)) await this.d.applications.expirePendingByPost(tx, post.id, now);
    });
    return this.detailOf(user, await this.require(postId));
  }

  async detail(user: AuthUser, postId: string): Promise<MentorPostDetailDto> {
    return this.detailOf(user, await this.require(postId));
  }

  async feed(user: AuthUser, query: ListPostsQueryDto): Promise<{ data: MentorPostCardDto[]; nextCursor: string | null }> {
    const q = query.q ? normalizeSearch(query.q) : "";
    const page = await this.d.posts.listFeed(
      { status: query.status, q: q || undefined, skills: parseSkillsCsv(query.skills), now: this.d.now() },
      query.cursor,
      query.limit
    );
    const [mine, lookups] = await Promise.all([
      this.d.applications.findMineForPosts(user.id, page.data.map((p) => p.id)),
      loadLookups(this.d.directory, page.data.map((p) => p.workspaceId), page.data.map((p) => p.createdBy)),
    ]);
    const mineByPost = new Map(mine.map((a) => [a.postId, a]));
    return { data: page.data.map((p) => toPostCard(p, lookups, mineByPost.get(p.id))), nextCursor: page.nextCursor };
  }

  /** `GET /workspaces/:id/mentor/posts` — mọi bài của nhóm (kể cả đóng/ẩn) + số đơn chờ (màn quản lý). */
  async listForWorkspace(user: AuthUser, workspaceId: string): Promise<MentorManagedPostDto[]> {
    await assertWorkspaceAdmin(this.d.access, user, workspaceId);
    const posts = await this.d.posts.listByWorkspace(workspaceId, 50);
    const [pending, lookups] = await Promise.all([
      this.d.applications.countPendingByPosts(posts.map((p) => p.id)),
      loadLookups(this.d.directory, [workspaceId], posts.map((p) => p.createdBy)),
    ]);
    return posts.map((p) => ({ ...toPostCard(p, lookups, undefined), version: p.version, pendingCount: pending[p.id] ?? 0, hidden: !!p.hiddenAt }));
  }

  private async detailOf(user: AuthUser, post: MentorPost): Promise<MentorPostDetailDto> {
    const role = await this.d.access.workspaceRole(user, post.workspaceId);
    const manage = isWorkspaceAdmin(role);
    if (post.hiddenAt && !manage) throw mentorErrors.notFound();
    const [mine, lookups] = await Promise.all([
      this.d.applications.findByPostAndApplicant(post.id, user.id),
      loadLookups(this.d.directory, [post.workspaceId], [post.createdBy]),
    ]);
    const now = this.d.now();
    const receiving = post.status === "OPEN" && post.expiresAt > now && !post.hiddenAt;
    return {
      ...toPostCard(post, lookups, mine ?? undefined),
      description: post.description,
      version: post.version,
      hidden: !!post.hiddenAt,
      closedAt: post.closedAt,
      myActions: {
        // Người đã thuộc nhóm (kể cả khách/cố vấn đang hoạt động) không ứng tuyển được (IR-23); server kiểm lại lúc nộp.
        apply: receiving && role === null && !mine,
        manage,
        report: !manage && post.createdBy !== user.id && !post.hiddenAt,
        withdraw: mine?.status === "PENDING",
      },
    };
  }

  private async require(postId: string): Promise<MentorPost> {
    const post = await this.d.posts.findById(postId);
    if (!post) throw mentorErrors.notFound();
    return post;
  }
}
