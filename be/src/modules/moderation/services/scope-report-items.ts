import type { AuthUser } from "../../../core/types/express";
import type { MessageModerationPort } from "../../../shared/ports/message-moderation.port";
import type { ReportGroup, ReportReasonValue, ReportResolutionValue, ReportStatusValue, ReportTargetTypeValue } from "../entities/report.interface";
import type { IModerationDirectory } from "../repositories/moderation-directory.repository.interface";

/** Item hàng đợi phạm vi (be.md p1-08 §4) — KHÔNG có `reporterId` (người báo cáo ẩn danh với người kiểm duyệt phạm vi, MOD-08). */
export interface ScopeReportItem {
  /** Báo cáo đại diện (mới nhất) — dùng làm `:reportId` cho `GET /reports/:id`, `POST /reports/:id/resolve`. */
  reportId: string;
  groupKey: string;
  targetType: ReportTargetTypeValue;
  targetId: string;
  reportCount: number;
  reasons: ReportReasonValue[];
  latestAt: Date;
  status: ReportStatusValue;
  resolution: ReportResolutionValue | null;
  scope: { type: "CHANNEL" | "CONVERSATION" | "WORKSPACE"; id: string; name?: string } | null;
  /** Chỉ có khi người xem ĐỌC được phạm vi của tin — lọc lại bằng `MessageModerationPort.canReadScope`. */
  preview?: { authorName: string | null; excerpt: string; deleted: boolean };
}

/**
 * Dựng `ScopeReportItem[]` cho 1 trang nhóm: tra tin + tên bằng vài truy vấn batch (không N+1) và
 * LỌC preview theo quyền ĐỌC của người xem (README §2 "Nội dung trong hàng đợi phạm vi").
 */
export async function buildScopeReportItems(
  viewer: AuthUser,
  groups: ReportGroup[],
  messages: MessageModerationPort,
  directory: IModerationDirectory
): Promise<ScopeReportItem[]> {
  const messageGroups = groups.filter((g) => g.targetType === "MESSAGE");
  const refs = await messages.findByIds(messageGroups.map((g) => g.targetId));
  const refById = new Map(refs.map((r) => [r.id, r]));

  const readable = new Map<string, boolean>();
  const canRead = async (scopeType: "CHANNEL" | "CONVERSATION", scopeId: string): Promise<boolean> => {
    const key = `${scopeType}:${scopeId}`;
    if (!readable.has(key)) readable.set(key, await messages.canReadScope(viewer, scopeType, scopeId));
    return readable.get(key) as boolean;
  };

  const previewable = new Set<string>();
  for (const g of messageGroups) {
    const ref = refById.get(g.targetId);
    if (ref && (await canRead(ref.scopeType, ref.scopeId))) previewable.add(g.targetId);
  }

  const ids = (predicate: (g: ReportGroup) => boolean, pick: (g: ReportGroup) => string | null): string[] =>
    groups.filter(predicate).map(pick).filter((id): id is string => id !== null);
  const [users, channels, conversations, workspaces] = await Promise.all([
    directory.findUsers([...previewable].map((id) => refById.get(id)?.authorId).filter((id): id is string => !!id)),
    directory.findChannels(ids((g) => g.scopeType === "CHANNEL", (g) => g.scopeId)),
    directory.findConversations(ids((g) => g.scopeType === "CONVERSATION", (g) => g.scopeId)),
    directory.findWorkspaces(ids((g) => g.scopeType === null && g.workspaceId !== null, (g) => g.workspaceId)),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const conversationTitle = new Map(conversations.map((c) => [c.id, c.title]));
  const workspaceName = new Map(workspaces.map((w) => [w.id, w.name]));

  return groups.map((g): ScopeReportItem => {
    const item: ScopeReportItem = {
      reportId: g.representativeId,
      groupKey: g.groupKey,
      targetType: g.targetType,
      targetId: g.targetId,
      reportCount: g.reportCount,
      reasons: g.reasons,
      latestAt: g.latestAt,
      status: g.status,
      resolution: g.resolution,
      scope: null,
    };
    if (g.scopeType === "CHANNEL" && g.scopeId) {
      item.scope = { type: "CHANNEL", id: g.scopeId, name: channelName.get(g.scopeId) };
    } else if (g.scopeType === "CONVERSATION" && g.scopeId) {
      item.scope = { type: "CONVERSATION", id: g.scopeId, name: conversationTitle.get(g.scopeId) ?? undefined };
    } else if (g.workspaceId) {
      item.scope = { type: "WORKSPACE", id: g.workspaceId, name: workspaceName.get(g.workspaceId) };
    }
    const ref = g.targetType === "MESSAGE" ? refById.get(g.targetId) : undefined;
    if (ref && previewable.has(g.targetId)) {
      item.preview = { authorName: ref.authorId ? (userName.get(ref.authorId) ?? null) : null, excerpt: ref.excerpt, deleted: ref.deleted };
    }
    return item;
  });
}
