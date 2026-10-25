import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { Report, ReportHandlerLevelValue, ReportResolutionValue, ReportStatusValue } from "../entities/report.interface";
import type { IReportRepository } from "../repositories/report.repository.interface";

/** Cổng audit — `AuditService` (module audit-log) thoả mãn qua structural typing. */
export interface ModerationAudit {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    workspaceId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface CloseGroupInput {
  /** Báo cáo đại diện của nhóm (cho `groupKey`, `workspaceId`, tác giả, loại đích). */
  representative: Report;
  actor: { id: string; role?: string };
  level: ReportHandlerLevelValue;
  status: Exclude<ReportStatusValue, "OPEN">;
  resolution: ReportResolutionValue;
  reason: string;
  /** Tên hành động ghi audit — `report.resolve` (phạm vi) hoặc `moderation.<action>` (nền tảng). */
  auditAction: string;
  /** Hành động người kiểm duyệt chọn (REMOVE_MESSAGE, LOCK_AUTHOR, …) — ghi vào metadata. */
  action: string;
  /** `true` → thêm outbox `moderation.author-warned` (tác giả nhận cảnh cáo). */
  warnAuthor?: boolean;
}

export interface CloseGroupResult {
  groupKey: string;
  status: Exclude<ReportStatusValue, "OPEN">;
  resolution: ReportResolutionValue;
  closedCount: number;
}

const alreadyResolved = (): AppError => new AppError(ErrorMessages[ErrorCode.MOD_001], 409, ErrorCode.MOD_001);

/**
 * Đóng MỌI báo cáo OPEN cùng `groupKey` trong 1 transaction + outbox (`report.resolved` → thông báo người báo cáo/
 * tác giả + socket admin; `moderation.author-warned` khi cảnh cáo) + audit — MỘT chỗ cho cả người kiểm duyệt phạm vi
 * (`ScopeModerationService.resolve`) lẫn nền tảng (`PlatformModerationService.act/removeMessage`), tránh 2 nơi lệch nhau
 * (be.md p1-08 §5.4/§5.6). Không có báo cáo OPEN (hoặc người khác đóng trước) → `MOD_001`.
 */
export class ReportCloser {
  constructor(
    private readonly repo: IReportRepository,
    private readonly audit: ModerationAudit
  ) {}

  /** Kiểm sớm (TRƯỚC khi gỡ tin/khoá tài khoản) — tránh làm hành động phụ không hoàn tác cho nhóm đã đóng. `close()` vẫn kiểm lại (race). */
  async assertOpen(groupKey: string): Promise<void> {
    if ((await this.repo.findByGroupKey(groupKey, "OPEN")).length === 0) throw alreadyResolved();
  }

  async close(input: CloseGroupInput): Promise<CloseGroupResult> {
    const { representative: rep, actor, level, status, resolution, reason } = input;
    const open = await this.repo.findByGroupKey(rep.groupKey, "OPEN");
    if (open.length === 0) throw alreadyResolved();

    const reporterIds = Array.from(new Set(open.map((r) => r.reporterId)));
    const resolvedAt = new Date();
    const stamp = resolvedAt.getTime();

    const closedCount = await withTransaction(async (tx) => {
      const count = await this.repo.closeGroup(tx, rep.groupKey, {
        status,
        resolution,
        resolvedBy: actor.id,
        resolvedAtLevel: level,
        resolvedAt,
        resolutionNote: reason,
      });
      if (count === 0) throw alreadyResolved();

      await outbox.add(tx, {
        type: "report.resolved",
        aggregateType: "Report",
        aggregateId: rep.id,
        queue: "notifications",
        jobName: "report.events",
        dedupeKey: `report.resolved:${rep.groupKey}:${stamp}`,
        payload: {
          event: "resolved",
          groupKey: rep.groupKey,
          targetType: rep.targetType,
          status,
          resolution,
          resolvedAt: resolvedAt.toISOString(),
          reporterIds,
          authorId: rep.targetAuthorId,
          messageId: rep.targetType === "MESSAGE" ? rep.targetId : null,
          reason,
        },
      });

      if (input.warnAuthor && rep.targetAuthorId) {
        await outbox.add(tx, {
          type: "moderation.author-warned",
          aggregateType: "Report",
          aggregateId: rep.id,
          queue: "notifications",
          jobName: "moderation.author-warned",
          dedupeKey: `moderation.author-warned:${rep.groupKey}:${stamp}`,
          payload: { groupKey: rep.groupKey, authorId: rep.targetAuthorId, reason, resolvedAt: resolvedAt.toISOString() },
        });
      }
      return count;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: input.auditAction,
      targetType: "Report",
      targetId: rep.id,
      workspaceId: rep.workspaceId ?? undefined,
      reason,
      metadata: { groupKey: rep.groupKey, action: input.action, level, resolution, closedCount },
    });

    return { groupKey: rep.groupKey, status, resolution, closedCount };
  }
}
