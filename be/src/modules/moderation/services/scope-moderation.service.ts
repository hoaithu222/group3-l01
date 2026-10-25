import { AppError, ScopeForbiddenError, ScopeNotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import { encodeCursor, decodeCursor } from "../../../core/utils/cursor";
import type { AuthUser } from "../../../core/types/express";
import type { PermissionService } from "../../../core/permission";
import type { MessageModerationPort } from "../../../shared/ports/message-moderation.port";
import type { Report, ReportGroup } from "../entities/report.interface";
import type { ListScopeReportsQueryDto, ResolveReportDto } from "../dtos";
import type { IModerationDirectory } from "../repositories/moderation-directory.repository.interface";
import type { IReportRepository, ReportScanFilter, ReportScopeFilter } from "../repositories/report.repository.interface";
import { afterGroupCursor, groupReports, sortGroupsByLatest } from "./report-grouping";
import type { CloseGroupResult, ReportCloser } from "./report-closer";
import { buildScopeReportItems, type ScopeReportItem } from "./scope-report-items";

export interface ScopeQueueResult {
  data: ScopeReportItem[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

export interface ScopeReportDetail extends ScopeReportItem {
  myActions: { canRemove: boolean; canDismiss: boolean; canWarn: boolean };
}

type AccessResolver = Pick<PermissionService, "resolve">;

const forbidden = (): ScopeForbiddenError => new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_006], ErrorCode.PERM_006);
const notApplicable = (): AppError => new AppError(ErrorMessages[ErrorCode.MOD_003], 400, ErrorCode.MOD_003);

/**
 * Hàng đợi + xử lý báo cáo THEO PHẠM VI (be.md p1-08 §5.3/§5.4): OWNER/ADMIN workspace (kênh public, USER có ngữ cảnh,
 * CHANNEL public), MANAGER kênh private, OWNER/ADMIN nhóm chat. Mọi kiểm quyền đi qua `MessageModerationPort`
 * (tin) / `permissionService` (workspace) — không tự so sánh vai trò ngoài "OWNER|ADMIN" của workspace (giống
 * `requireWorkspaceRole` ở core). Báo cáo 1-1/nhóm chat-là-đích/kênh private-là-đích chỉ nền tảng xử lý (`PLATFORM_ONLY`).
 */
export class ScopeModerationService {
  constructor(
    private readonly repo: IReportRepository,
    private readonly directory: IModerationDirectory,
    private readonly messages: MessageModerationPort,
    private readonly access: AccessResolver,
    private readonly closer: ReportCloser
  ) {}

  /** `GET /workspaces/:workspaceId/reports` — không có phạm vi kiểm duyệt nào → 403 `PERM_001`. */
  async listForWorkspace(viewer: AuthUser, workspaceId: string, query: ListScopeReportsQueryDto): Promise<ScopeQueueResult> {
    const scopes = await this.moderableScopes(viewer, workspaceId);
    if (!scopes) throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
    return this.listGroups(viewer, { status: query.status, handlerLevel: "SCOPE", scopes }, query);
  }

  /** `GET /conversations/:conversationId/reports` — route đã `requireScope(CONVERSATION, "conversation.member.remove")`. */
  async listForConversation(viewer: AuthUser, conversationId: string, query: ListScopeReportsQueryDto): Promise<ScopeQueueResult> {
    const scopes: ReportScopeFilter = { workspaceIds: [], channelIds: [], conversationIds: [conversationId] };
    return this.listGroups(viewer, { status: query.status, handlerLevel: "SCOPE", scopes }, query);
  }

  /** `GET /reports/:reportId` — người báo cáo (chỉ báo cáo CỦA MÌNH) hoặc người xử lý phạm vi; còn lại 404 trung tính. */
  async getDetail(viewer: AuthUser, reportId: string): Promise<ScopeReportDetail> {
    const report = await this.repo.findById(reportId);
    if (!report) throw new ScopeNotFoundError();
    const isHandler = await this.canModerate(viewer, report);
    if (!isHandler && report.reporterId !== viewer.id) throw new ScopeNotFoundError();

    // Người xử lý thấy cả nhóm (mọi lý do); người báo cáo thuần chỉ thấy đúng báo cáo của mình (không lộ người báo cáo khác).
    const rows = isHandler ? await this.repo.findByGroupKey(report.groupKey) : [report];
    const [group] = groupReports(rows);
    const [item] = await buildScopeReportItems(viewer, [group], this.messages, this.directory);
    const open = group.status === "OPEN";
    return {
      ...item,
      myActions: {
        canRemove: isHandler && open && report.targetType === "MESSAGE",
        canDismiss: isHandler && open,
        canWarn: isHandler && open && report.targetAuthorId !== null,
      },
    };
  }

  /** `POST /reports/:reportId/resolve` — đóng CẢ NHÓM `groupKey`. */
  async resolve(actor: AuthUser, reportId: string, dto: ResolveReportDto): Promise<CloseGroupResult> {
    const report = await this.repo.findById(reportId);
    if (!report || report.handlerLevel !== "SCOPE") throw new ScopeNotFoundError();
    await this.assertCanModerate(actor, report);

    // Kiểm hành động áp dụng TRƯỚC khi gỡ tin (không hoàn tác được).
    if (dto.action === "REMOVE_MESSAGE" && report.targetType !== "MESSAGE") throw notApplicable();
    if (dto.action === "WARN_AUTHOR" && !report.targetAuthorId) throw notApplicable();
    await this.closer.assertOpen(report.groupKey);

    const actorRef = { id: actor.id, role: actor.role };
    if (dto.action === "REMOVE_MESSAGE") {
      await this.messages.removeByModerator({
        messageId: report.targetId,
        actorId: actor.id,
        actorRole: actor.role,
        reason: dto.reason,
        source: "REPORT",
        reportId: report.id,
      });
    }

    const outcome = {
      REMOVE_MESSAGE: { status: "RESOLVED", resolution: "CONTENT_REMOVED" },
      WARN_AUTHOR: { status: "RESOLVED", resolution: "AUTHOR_WARNED" },
      DISMISS: { status: "DISMISSED", resolution: "NO_ACTION" },
    } as const;
    return this.closer.close({
      representative: report,
      actor: actorRef,
      level: "SCOPE",
      ...outcome[dto.action],
      reason: dto.reason,
      auditAction: "report.resolve",
      action: dto.action,
      warnAuthor: dto.action === "WARN_AUTHOR",
    });
  }

  // ── nội bộ ─────────────────────────────────────────────────────────────────

  /** Tập phạm vi kiểm duyệt của người xem TRONG workspace này (be.md §5.3) — `null` nếu không có phạm vi nào. */
  private async moderableScopes(viewer: AuthUser, workspaceId: string): Promise<ReportScopeFilter | null> {
    const [isWorkspaceAdmin, channelIds, conversationIds] = await Promise.all([
      this.isWorkspaceAdmin(viewer, workspaceId),
      this.directory.listManagedPrivateChannelIds(viewer.id, workspaceId),
      this.directory.listAdministeredGroupIds(viewer.id, workspaceId),
    ]);
    const workspaceIds = isWorkspaceAdmin ? [workspaceId] : [];
    if (workspaceIds.length + channelIds.length + conversationIds.length === 0) return null;
    return { workspaceIds, channelIds, conversationIds };
  }

  private async listGroups(viewer: AuthUser, filter: ReportScanFilter, query: ListScopeReportsQueryDto): Promise<ScopeQueueResult> {
    const reports = await this.repo.scan(filter, LIMITS.report.groupScanMax);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const groups = afterGroupCursor(sortGroupsByLatest(groupReports(reports)), cursor);
    const hasMore = groups.length > query.limit;
    const page: ReportGroup[] = hasMore ? groups.slice(0, query.limit) : groups;
    const last = page[page.length - 1];
    return {
      data: await buildScopeReportItems(viewer, page, this.messages, this.directory),
      meta: { nextCursor: hasMore && last ? encodeCursor(last.latestAt, last.groupKey) : null, hasMore, limit: query.limit },
    };
  }

  private async isWorkspaceAdmin(user: AuthUser, workspaceId: string): Promise<boolean> {
    const access = await this.access.resolve(user, { type: "WORKSPACE", id: workspaceId });
    return access.visible && (access.role === "OWNER" || access.role === "ADMIN");
  }

  /** MESSAGE → theo phạm vi của tin; USER/CHANNEL public → OWNER/ADMIN workspace chứa báo cáo; còn lại không thuộc hàng đợi phạm vi. */
  private async canModerate(user: AuthUser, report: Report): Promise<boolean> {
    if (report.handlerLevel !== "SCOPE") return false;
    if (report.targetType === "MESSAGE") {
      return report.scopeType && report.scopeId ? this.messages.canModerateScope(user, report.scopeType, report.scopeId) : false;
    }
    // `STUDY_SET` (p4-01, bộ WORKSPACE): OWNER/ADMIN nhóm bỏ qua báo cáo ở đây; ẩn bộ qua `POST /study-sets/:id/hide` (đóng báo cáo mở).
    if (report.targetType === "USER" || report.targetType === "CHANNEL" || report.targetType === "STUDY_SET") {
      return report.workspaceId ? this.isWorkspaceAdmin(user, report.workspaceId) : false;
    }
    return false;
  }

  /** Không thấy → 404 trung tính; thấy nhưng không phải người kiểm duyệt → 403 `PERM_006`. */
  private async assertCanModerate(user: AuthUser, report: Report): Promise<void> {
    if (await this.canModerate(user, report)) return;
    const visible =
      report.targetType === "MESSAGE" && report.scopeType && report.scopeId
        ? await this.messages.canReadScope(user, report.scopeType, report.scopeId)
        : report.workspaceId
          ? (await this.access.resolve(user, { type: "WORKSPACE", id: report.workspaceId })).visible
          : false;
    if (!visible) throw new ScopeNotFoundError();
    throw forbidden();
  }
}
