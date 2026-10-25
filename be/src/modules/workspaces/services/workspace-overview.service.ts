import { redis } from "../../../infrastructure/redis";
import { logger } from "../../../infrastructure/logger";
import { LIMITS } from "../../../core/constants/limits";
import { resolveGuestPolicy } from "../../../core/constants/guest-policy";
import { RuntimeGuestConfig } from "../../../core/config/guest-config";
import { NotFoundError } from "../../../core/exceptions";
import type { IWorkspaceRepository } from "../repositories/workspace.repository.interface";
import { listWorkspaceOverviewContributors, type WorkspaceOverviewContext } from "./workspace-overview.registry";
import { systemDefaultTimeZone } from "../../../core/config/workspace-timezone";
import { toWorkspaceDetail, type WorkspaceDetail } from "./workspace.presenter";

export interface WorkspaceOverview {
  workspace: WorkspaceDetail;
  channels: unknown;
  needsResponse: unknown;
  recentGroups: unknown;
  /** Vắng mặt với GUEST (p3-04 §5.6 "không `memberCount`"). */
  memberCount?: number;
  admin?: unknown;
  upcomingMeetings?: unknown;
}

function cacheKey(userId: string, workspaceId: string): string {
  // be.md §5.7 gợi ý khoá kèm `permVer` để bất hoạt ngay khi quyền đổi —
  // KHÔNG có API đọc version công khai ở `core/permission` (nội bộ
  // `permission.cache.ts`); TTL 10s đã đủ ngắn nên bỏ phần đó, đơn giản hơn
  // mà không đổi hành vi đáng kể (chờ tối đa 10s thay vì bất hoạt tức thì).
  return `ws:overview:${userId}:${workspaceId}`;
}

/** be.md §5.7 — gộp workspace + các khối do module khác đóng góp (registry), cache Redis ngắn. */
export class WorkspaceOverviewService {
  private readonly guestConfig = new RuntimeGuestConfig();

  constructor(private readonly repo: IWorkspaceRepository) {}

  async get(ctx: WorkspaceOverviewContext): Promise<WorkspaceOverview> {
    const key = cacheKey(ctx.userId, ctx.workspaceId);
    const cached = await this.safeGet(key);
    if (cached) return cached;

    const workspace = await this.repo.findById(ctx.workspaceId);
    if (!workspace) throw new NotFoundError();
    const [memberCount, membership] = await Promise.all([
      this.repo.countMembers(ctx.workspaceId),
      this.repo.findMembership(ctx.workspaceId, ctx.userId),
    ]);
    if (!membership) throw new NotFoundError();

    // p3-04 §5.6 — KHÁCH chỉ nhận khối `channels` (đã lọc theo kênh chỉ định); các khối còn lại (cần phản hồi, nhóm chat,
    // số liệu quản trị, cuộc họp sắp tới) thuộc phạm vi thành viên → bỏ hẳn, không truy vấn.
    const isGuest = ctx.role === "GUEST";
    const contributors = listWorkspaceOverviewContributors().filter((c) => !isGuest || c.key === "channels");
    const settled = await Promise.allSettled(
      contributors.map(async (c) => [c.key, await c.load(ctx)] as const)
    );

    const sections: Partial<Record<string, unknown>> = {};
    for (const result of settled) {
      if (result.status === "fulfilled") {
        const [key, value] = result.value;
        sections[key] = value;
      } else {
        logger.warn("[workspaces] overview contributor lỗi — bỏ khối, không chặn cả trang", {
          workspaceId: ctx.workspaceId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    const overview: WorkspaceOverview = {
      workspace: toWorkspaceDetail(
        workspace,
        memberCount,
        ctx.access,
        membership,
        isGuest ? undefined : resolveGuestPolicy(workspace.guestPolicy, await this.guestConfig.load()),
        await systemDefaultTimeZone()
      ),
      channels: sections.channels ?? null,
      needsResponse: sections.needsResponse ?? null,
      recentGroups: sections.recentGroups ?? null,
      ...(!isGuest && { memberCount }),
      admin: sections.admin,
      upcomingMeetings: sections.upcomingMeetings,
    };

    await this.safeSet(key, overview);
    return overview;
  }

  private async safeGet(key: string): Promise<WorkspaceOverview | null> {
    try {
      return await redis.get<WorkspaceOverview>(key);
    } catch {
      return null;
    }
  }

  private async safeSet(key: string, overview: WorkspaceOverview): Promise<void> {
    try {
      await redis.set(key, overview, LIMITS.workspace.overviewCacheSeconds);
    } catch (err) {
      logger.warn("[workspaces] Lỗi ghi cache overview, bỏ qua", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
