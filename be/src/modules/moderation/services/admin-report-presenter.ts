import type { ReportGroup, ReportReasonValue, ReportResolutionValue, ReportStatusValue, ReportTargetTypeValue } from "../entities/report.interface";
import type { IModerationDirectory } from "../repositories/moderation-directory.repository.interface";

/** Nhóm báo cáo cho admin nền tảng (be.md p1-08 §4 `AdminReportGroup`) — CHỈ metadata, không nội dung riêng tư. */
export interface AdminReportGroup {
  /** Báo cáo đại diện — dùng làm `:reportId` cho `GET/PATCH /admin/reports/:reportId`. */
  reportId: string;
  groupKey: string;
  targetType: ReportTargetTypeValue;
  targetId: string;
  reportCount: number;
  reasons: ReportReasonValue[];
  workspace?: { id: string; name: string };
  /** `name` CHỈ cho kênh public (README §6: kênh private/nhóm chat/1-1 chỉ metadata). */
  scope: { type: "CHANNEL" | "CONVERSATION" | null; isPrivate: boolean; name?: string };
  targetAuthor?: { id: string; name: string };
  firstAt: Date;
  latestAt: Date;
  status: ReportStatusValue;
  resolution: ReportResolutionValue | null;
  handlerLevel: "SCOPE" | "PLATFORM_ONLY";
}

/** Dựng `AdminReportGroup[]` cho 1 trang — 3 truy vấn batch (user/workspace/kênh public), không N+1. */
export async function buildAdminGroups(groups: ReportGroup[], directory: IModerationDirectory): Promise<AdminReportGroup[]> {
  const compact = (ids: Array<string | null>): string[] => ids.filter((id): id is string => id !== null);
  const [users, workspaces, channels] = await Promise.all([
    directory.findUsers(compact(groups.map((g) => g.targetAuthorId))),
    directory.findWorkspaces(compact(groups.map((g) => g.workspaceId))),
    directory.findChannels(compact(groups.filter((g) => g.scopeType === "CHANNEL" && !g.scopeIsPrivate).map((g) => g.scopeId))),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const workspaceName = new Map(workspaces.map((w) => [w.id, w.name]));
  const channelName = new Map(channels.map((c) => [c.id, c.name]));

  return groups.map((g): AdminReportGroup => {
    const workspaceLabel = g.workspaceId ? workspaceName.get(g.workspaceId) : undefined;
    const authorLabel = g.targetAuthorId ? userName.get(g.targetAuthorId) : undefined;
    return {
      reportId: g.representativeId,
      groupKey: g.groupKey,
      targetType: g.targetType,
      targetId: g.targetId,
      reportCount: g.reportCount,
      reasons: g.reasons,
      ...(g.workspaceId && workspaceLabel !== undefined && { workspace: { id: g.workspaceId, name: workspaceLabel } }),
      scope: {
        type: g.scopeType,
        isPrivate: g.scopeIsPrivate,
        ...(g.scopeType === "CHANNEL" && !g.scopeIsPrivate && g.scopeId && channelName.has(g.scopeId) && { name: channelName.get(g.scopeId) }),
      },
      ...(g.targetAuthorId && authorLabel !== undefined && { targetAuthor: { id: g.targetAuthorId, name: authorLabel } }),
      firstAt: g.firstAt,
      latestAt: g.latestAt,
      status: g.status,
      resolution: g.resolution,
      handlerLevel: g.handlerLevel,
    };
  });
}
