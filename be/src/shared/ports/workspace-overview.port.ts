import type { ResolvedAccess } from "../../core/permission";

/**
 * Cổng "khối tổng quan workspace" (p1-01 be.md §5.7) — đặt ở `shared/ports/` (giống
 * `ChannelBootstrapPort`/`MembershipLifecyclePort`) để module KHÁC (`channels` p1-03,
 * `conversations` p1-05, `read-state` p1-07…) đăng ký contributor mà KHÔNG import
 * `modules/workspaces` (luật 3 tầng, `.claude/rules/architecture.md`). `modules/workspaces`
 * chỉ đọc registry này ở `WorkspaceOverviewService`.
 */
export type WorkspaceOverviewRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export interface WorkspaceOverviewContext {
  userId: string;
  workspaceId: string;
  access: ResolvedAccess;
  role: WorkspaceOverviewRole;
}

/**
 * Khối overview do module khác đóng góp (be.md §5.7) — "channels" (p1-03), "recentGroups"
 * (p1-05), "needsResponse" (p1-07), "admin" (p1-02 số lời mời/báo cáo), "upcomingMeetings"
 * (p2-04). Khoá KHÔNG có trong registry → `WorkspaceOverviewService` trả `null` cho phần
 * bắt buộc, bỏ hẳn phần tuỳ chọn (`admin`/`upcomingMeetings`) — đúng nguyên tắc README
 * "module chưa có thì bỏ khối".
 *
 * ⚠ Contributor PHẢI tự lọc theo quyền của `ctx.userId` — không trả tên/số đếm của tài
 * nguyên người đó không thấy được (vd kênh private không có grant — WS-09).
 */
export type WorkspaceOverviewKey = "channels" | "needsResponse" | "recentGroups" | "admin" | "upcomingMeetings";

export interface WorkspaceOverviewContributor {
  key: WorkspaceOverviewKey;
  load(ctx: WorkspaceOverviewContext): Promise<unknown>;
}

const registry = new Map<WorkspaceOverviewKey, WorkspaceOverviewContributor>();

/** Gọi lúc boot của module cung cấp khối (vd `registerChannelModule()`); đăng ký lại cùng `key` sẽ GHI ĐÈ. */
export function registerWorkspaceOverviewContributor(contributor: WorkspaceOverviewContributor): void {
  registry.set(contributor.key, contributor);
}

export function listWorkspaceOverviewContributors(): WorkspaceOverviewContributor[] {
  return [...registry.values()];
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearWorkspaceOverviewContributors(): void {
  registry.clear();
}
