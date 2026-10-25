/**
 * Registry "khối tổng quan workspace" đã chuyển sang `shared/ports/workspace-overview.port.ts`
 * (2026-09-19) để module khác (channels p1-03, conversations p1-05, read-state p1-07…) đăng ký
 * contributor mà không import chéo `modules/workspaces`. File này chỉ còn re-export để giữ
 * đường import cũ của `workspace-overview.service.ts`/test hiện có.
 */
export {
  registerWorkspaceOverviewContributor,
  listWorkspaceOverviewContributors,
  clearWorkspaceOverviewContributors,
  type WorkspaceOverviewContext,
  type WorkspaceOverviewContributor,
  type WorkspaceOverviewKey,
} from "../../../shared/ports/workspace-overview.port";
