import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { AppError, ForbiddenError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { LIMITS } from "../../../core/constants/limits";
import { roleHasPermission } from "../../../core/constants/permissions";
import type { AuthUser } from "../../../core/types/express";
import type { ChannelAdminPort, ConversationAdminPort, UsersAdminPort } from "../../../shared/ports/moderation-actions.port";
import type { MessageForModeration, MessageModerationPort } from "../../../shared/ports/message-moderation.port";
import type { Report, ReportReasonValue, ReportResolutionValue, ReportStatusValue, ReportTargetTypeValue } from "../entities/report.interface";
import type { AdminActionDto, AdminActionValue, AdminListReportsQueryDto, AdminRemoveMessageDto } from "../dtos";
import type { IModerationDirectory } from "../repositories/moderation-directory.repository.interface";
import type { IReportRepository } from "../repositories/report.repository.interface";
import { buildAdminGroups, type AdminReportGroup } from "./admin-report-presenter";
import { groupReports, sortGroups } from "./report-grouping";
import type { CloseGroupResult, ReportCloser } from "./report-closer";

export type ModerationMessage = MessageForModeration & { authorName: string | null };

/** Khoá `SystemConfig` (registry) của thời hạn xem nội dung riêng tư sau khi đóng báo cáo (giờ) — mặc định `LIMITS.report.privateViewGraceHours`. */
export const PRIVATE_VIEW_GRACE_KEY = "moderation.privateViewGraceHours";

/** Đọc giá trị hiệu lực (default ⊕ override đã clamp floor/ceil, cache) — fail-open về hằng số nếu khoá lỗi/không phải số. */
async function runtimePrivateViewGraceHours(): Promise<number> {
  const { value } = await runtimeConfig.getEffective(PRIVATE_VIEW_GRACE_KEY);
  return typeof value === "number" && Number.isFinite(value) ? value : LIMITS.report.privateViewGraceHours;
}

export interface AdminReportListResult {
  data: AdminReportGroup[];
  total: number;
}

export interface AdminReportDetail {
  group: AdminReportGroup;
  /** Người báo cáo — nền tảng thấy danh tính (README §2 "Người báo cáo"). */
  reports: Array<{
    id: string;
    reporter: { id: string; name: string } | null;
    reason: ReportReasonValue;
    description: string | null;
    status: ReportStatusValue;
    createdAt: Date;
  }>;
  /** Chỉ tin trong KÊNH PUBLIC (`moderation:view`) — kênh private/nhóm chat/1-1 đi qua `GET .../content` (D-06). */
  publicContent?: ModerationMessage[];
  history: Array<{
    id: string;
    groupKey: string;
    targetType: ReportTargetTypeValue;
    reason: ReportReasonValue;
    status: ReportStatusValue;
    resolution: ReportResolutionValue | null;
    createdAt: Date;
  }>;
  authorStats: { reports30d: number; removed30d: number } | null;
}

export interface AdminReportContent {
  messages: ModerationMessage[];
  scope: { type: "CHANNEL" | "CONVERSATION"; id: string; name?: string };
  viewedAt: Date;
  /** `null` khi báo cáo còn OPEN; sau khi đóng = `resolvedAt + privateViewGraceHours`. */
  accessExpiresAt: Date | null;
}

interface ActionPlan {
  status: "RESOLVED" | "DISMISSED";
  resolution: ReportResolutionValue;
  audit: string;
}

const ACTION_PLAN: Record<AdminActionValue, ActionPlan> = {
  DISMISS: { status: "DISMISSED", resolution: "NO_ACTION", audit: "moderation.dismiss" },
  REMOVE_CONTENT: { status: "RESOLVED", resolution: "CONTENT_REMOVED", audit: "moderation.remove-content" },
  WARN_AUTHOR: { status: "RESOLVED", resolution: "AUTHOR_WARNED", audit: "moderation.warn-author" },
  LOCK_AUTHOR: { status: "RESOLVED", resolution: "USER_LOCKED", audit: "moderation.lock-author" },
  ARCHIVE_CHANNEL: { status: "RESOLVED", resolution: "CHANNEL_ARCHIVED", audit: "moderation.archive-channel" },
  DISSOLVE_CONVERSATION: { status: "RESOLVED", resolution: "CONVERSATION_DISSOLVED", audit: "moderation.dissolve-conversation" },
};

const DAY_MS = 24 * 3600 * 1000;
const HISTORY_LIMIT = 10;

const err = (status: 400 | 403, code: keyof typeof ErrorCode): AppError => new AppError(ErrorMessages[ErrorCode[code]], status, ErrorCode[code]);

/**
 * Phía admin nền tảng (be.md p1-08 §5.5/§5.6): hàng đợi gộp theo đích, chi tiết, xem nội dung riêng tư theo D-06
 * (`moderation:approve` + AUDIT TRONG transaction + thông báo + hết hạn) và hành động PATCH. Nền tảng KHÔNG đọc nội
 * dung chat riêng/nhóm/kênh riêng tư ngoài luồng D-06 — `list`/`detail` chỉ trả metadata (+ tin kênh PUBLIC).
 */
export class PlatformModerationService {
  constructor(
    private readonly repo: IReportRepository,
    private readonly directory: IModerationDirectory,
    private readonly messages: MessageModerationPort,
    private readonly closer: ReportCloser,
    private readonly users: UsersAdminPort,
    private readonly channels: ChannelAdminPort,
    private readonly conversations: ConversationAdminPort,
    /** Số giờ còn xem được nội dung riêng tư sau khi đóng báo cáo — mặc định đọc `SystemConfig` (test truyền số cố định). */
    private readonly graceHours: () => Promise<number> = runtimePrivateViewGraceHours
  ) {}

  async list(query: AdminListReportsQueryDto): Promise<AdminReportListResult> {
    const reports = await this.repo.scan(
      { status: query.status, targetType: query.targetType, workspaceId: query.workspaceId, reason: query.reason, from: query.from, to: query.to },
      LIMITS.report.groupScanMax
    );
    const groups = sortGroups(groupReports(reports), query.sort);
    const page = groups.slice((query.page - 1) * query.limit, query.page * query.limit);
    return { data: await buildAdminGroups(page, this.directory), total: groups.length };
  }

  async detail(reportId: string): Promise<AdminReportDetail> {
    const report = await this.requireReport(reportId);
    const rows = await this.repo.findByGroupKey(report.groupKey);
    const [group] = await buildAdminGroups(groupReports(rows), this.directory);

    const reporters = await this.directory.findUsers(rows.map((r) => r.reporterId));
    const reporterById = new Map(reporters.map((u) => [u.id, u]));

    const isPublicChannelMessage = report.targetType === "MESSAGE" && report.scopeType === "CHANNEL" && !report.scopeIsPrivate;
    const since30d = new Date(Date.now() - 30 * DAY_MS);
    const authorId = report.targetAuthorId;
    const [publicMessages, recent, reports30d, removed30d] = await Promise.all([
      isPublicChannelMessage ? this.messages.contextAround(report.targetId, LIMITS.report.contentContextSize) : Promise.resolve(null),
      authorId ? this.repo.listRecentByAuthor(authorId, HISTORY_LIMIT + 1) : Promise.resolve([]),
      authorId ? this.repo.countByAuthor(authorId, since30d) : Promise.resolve(0),
      authorId ? this.repo.countRemovedByAuthor(authorId, since30d) : Promise.resolve(0),
    ]);

    return {
      group,
      reports: rows.map((r) => ({
        id: r.id,
        reporter: reporterById.get(r.reporterId) ?? null,
        reason: r.reason,
        description: r.description,
        status: r.status,
        createdAt: r.createdAt,
      })),
      ...(publicMessages && { publicContent: await this.withAuthorNames(publicMessages) }),
      history: recent
        .filter((r) => r.groupKey !== report.groupKey)
        .slice(0, HISTORY_LIMIT)
        .map((r) => ({ id: r.id, groupKey: r.groupKey, targetType: r.targetType, reason: r.reason, status: r.status, resolution: r.resolution, createdAt: r.createdAt })),
      authorStats: authorId ? { reports30d, removed30d } : null,
    };
  }

  /**
   * `GET /admin/reports/:reportId/content` — D-06. Điều kiện: đích MESSAGE trong phạm vi PRIVATE (kênh private/nhóm chat/1-1),
   * báo cáo còn OPEN hoặc còn trong `privateViewGraceHours` sau khi đóng. Audit `moderation.view-private` ghi TRONG cùng
   * transaction với outbox thông báo — ghi audit lỗi thì KHÔNG trả nội dung.
   */
  async content(actor: AuthUser, reportId: string): Promise<AdminReportContent> {
    const report = await this.requireReport(reportId);
    if (report.targetType !== "MESSAGE" || !report.scopeIsPrivate || !report.scopeType || !report.scopeId) throw err(403, "MOD_004");

    const now = new Date();
    const accessExpiresAt = await this.accessExpiry(report.groupKey);
    if (accessExpiresAt && accessExpiresAt.getTime() <= now.getTime()) throw err(403, "MOD_005");

    const context = await this.messages.contextAround(report.targetId, LIMITS.report.contentContextSize);
    if (context.length === 0) throw new NotFoundError();

    const [conversation] = report.scopeType === "CONVERSATION" ? await this.directory.findConversations([report.scopeId]) : [];
    const isDirect = conversation?.kind === "DIRECT";
    const participantIds = isDirect ? await this.directory.listConversationMemberIds(report.scopeId) : [];
    const { scopeType, scopeId } = report;

    await withTransaction(async (tx) => {
      await this.repo.recordAudit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "moderation.view-private",
        targetType: "Report",
        targetId: report.id,
        workspaceId: report.workspaceId ?? undefined,
        metadata: { scopeType, scopeId, messageIds: context.map((m) => m.id) },
      });
      // dedupeKey duy nhất theo LẦN xem (mỗi lần xem đều audit); consumer dedupe THÔNG BÁO theo report+ngày (1/report/24 h).
      await outbox.add(tx, {
        type: "moderation.private-viewed",
        aggregateType: "Report",
        aggregateId: report.id,
        queue: "notifications",
        jobName: "moderation.private-viewed.notify",
        dedupeKey: `moderation.private-viewed:${report.id}:${now.getTime()}`,
        payload: { reportId: report.id, scopeType, scopeId, workspaceId: report.workspaceId, isDirect, participantIds, viewedAt: now.toISOString() },
      });
    });

    return {
      messages: await this.withAuthorNames(context),
      scope: await this.scopeLabel(scopeType, scopeId),
      viewedAt: now,
      accessExpiresAt,
    };
  }

  /** `PATCH /admin/reports/:reportId` — mọi hành động đóng CẢ NHÓM `groupKey` + audit `moderation.<action>`. */
  async act(actor: AuthUser, reportId: string, dto: AdminActionDto): Promise<CloseGroupResult> {
    const report = await this.requireReport(reportId);
    this.assertApplicable(report, dto.action);
    if (dto.action === "LOCK_AUTHOR" && !roleHasPermission(actor.role, "user:update")) {
      throw new ForbiddenError("Bạn không có quyền khoá tài khoản");
    }
    await this.closer.assertOpen(report.groupKey);

    switch (dto.action) {
      case "REMOVE_CONTENT":
        await this.messages.removeByModerator({ messageId: report.targetId, actorId: actor.id, actorRole: actor.role, reason: dto.reason, source: "PLATFORM", reportId: report.id });
        break;
      case "LOCK_AUTHOR":
        await this.users.lock(report.targetAuthorId as string, actor.id, dto.reason);
        break;
      case "ARCHIVE_CHANNEL":
        await this.channels.platformArchive(actor.id, report.targetId, dto.reason);
        break;
      case "DISSOLVE_CONVERSATION":
        await this.conversations.platformDissolve(actor.id, report.targetId);
        break;
      case "DISMISS":
      case "WARN_AUTHOR":
        break;
    }

    const plan = ACTION_PLAN[dto.action];
    return this.closer.close({
      representative: report,
      actor: { id: actor.id, role: actor.role },
      level: "PLATFORM_ONLY",
      status: plan.status,
      resolution: plan.resolution,
      reason: dto.reason,
      auditAction: plan.audit,
      action: dto.action,
      warnAuthor: dto.action === "WARN_AUTHOR",
    });
  }

  /**
   * `POST /admin/messages/:messageId/remove` — gỡ tin cấp nền tảng KHÔNG cần đi qua 1 báo cáo. Nếu tin đang bị báo cáo thì đóng
   * luôn nhóm báo cáo; không thì vẫn báo tác giả qua outbox `report.events` (`content-removed`).
   */
  async removeMessage(actor: AuthUser, messageId: string, dto: AdminRemoveMessageDto): Promise<{ messageId: string; deletedAt: Date }> {
    const removed = await this.messages.removeByModerator({ messageId, actorId: actor.id, actorRole: actor.role, reason: dto.reason, source: "PLATFORM" });
    const open = (await this.repo.findByGroupKey(`MESSAGE:${messageId}`, "OPEN"))[0];
    if (open) {
      await this.closer.close({
        representative: open,
        actor: { id: actor.id, role: actor.role },
        level: "PLATFORM_ONLY",
        status: "RESOLVED",
        resolution: "CONTENT_REMOVED",
        reason: dto.reason,
        auditAction: "moderation.remove-content",
        action: "REMOVE_CONTENT",
      });
    } else if (!removed.alreadyDeleted) {
      await this.notifyAuthorRemoved(messageId, dto.reason);
    }
    return { messageId, deletedAt: removed.deletedAt };
  }

  // ── nội bộ ─────────────────────────────────────────────────────────────────

  private async requireReport(reportId: string): Promise<Report> {
    const report = await this.repo.findById(reportId);
    if (!report) throw new NotFoundError();
    return report;
  }

  /** REMOVE_CONTENT↔MESSAGE, ARCHIVE_CHANNEL↔CHANNEL, DISSOLVE_CONVERSATION↔CONVERSATION, WARN/LOCK cần tác giả; DISMISS luôn được. */
  private assertApplicable(report: Report, action: AdminActionValue): void {
    const ok =
      action === "DISMISS" ||
      (action === "REMOVE_CONTENT" && report.targetType === "MESSAGE") ||
      ((action === "WARN_AUTHOR" || action === "LOCK_AUTHOR") && report.targetAuthorId !== null) ||
      (action === "ARCHIVE_CHANNEL" && report.targetType === "CHANNEL") ||
      (action === "DISSOLVE_CONVERSATION" && report.targetType === "CONVERSATION");
    if (!ok) throw err(400, "MOD_003");
  }

  /** `null` = còn báo cáo OPEN trong nhóm (không hết hạn); ngược lại = lần đóng gần nhất + `privateViewGraceHours`. */
  private async accessExpiry(groupKey: string): Promise<Date | null> {
    const rows = await this.repo.findByGroupKey(groupKey);
    if (rows.some((r) => r.status === "OPEN")) return null;
    const lastResolvedAt = Math.max(0, ...rows.map((r) => r.resolvedAt?.getTime() ?? 0));
    return new Date(lastResolvedAt + (await this.graceHours()) * 3600 * 1000);
  }

  private async withAuthorNames(messages: MessageForModeration[]): Promise<ModerationMessage[]> {
    const ids = messages.map((m) => m.authorId).filter((id): id is string => id !== null);
    const users = await this.directory.findUsers(ids);
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    return messages.map((m) => ({ ...m, authorName: m.authorId ? (nameById.get(m.authorId) ?? null) : null }));
  }

  private async scopeLabel(scopeType: "CHANNEL" | "CONVERSATION", scopeId: string): Promise<AdminReportContent["scope"]> {
    if (scopeType === "CHANNEL") {
      const [channel] = await this.directory.findChannels([scopeId]);
      return { type: "CHANNEL", id: scopeId, name: channel?.name };
    }
    const [conversation] = await this.directory.findConversations([scopeId]);
    return { type: "CONVERSATION", id: scopeId, name: conversation?.title ?? undefined };
  }

  private async notifyAuthorRemoved(messageId: string, reason: string): Promise<void> {
    const [ref] = await this.messages.findByIds([messageId]);
    if (!ref?.authorId) return;
    const authorId = ref.authorId;
    await withTransaction(async (tx) => {
      await outbox.add(tx, {
        type: "moderation.content-removed",
        aggregateType: "Message",
        aggregateId: messageId,
        queue: "notifications",
        jobName: "report.events",
        dedupeKey: `moderation.content-removed:${messageId}`,
        payload: { event: "content-removed", messageId, authorId, reason },
      });
    });
  }
}
