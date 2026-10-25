import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import type { CloseReportsInput, ReportPort, SubmitReportInput, SubmitReportResult } from "../../../shared/ports/report.port";
import { buildGroupKey, type ReportReasonValue, type ReportTargetTypeValue } from "../entities/report.interface";
import type { IReportRepository } from "../repositories/report.repository.interface";
import type { ReportCloser } from "./report-closer";
import type { ReportService } from "./report.service";

/**
 * Cài đặt `ReportPort` (`shared/ports/report.port`) cho module khác có đích báo cáo riêng (p4-01 `STUDY_SET`) — bọc
 * `ReportService.create` (idempotent theo người × đích, outbox `report.created`) và `ReportCloser.close` (đóng CẢ nhóm báo cáo
 * mở của một đích trong 1 transaction + outbox `report.resolved` + audit) để module đó không import `moderation`.
 */
export class ModerationReportPort implements ReportPort {
  constructor(
    private readonly reports: ReportService,
    private readonly repo: IReportRepository,
    private readonly closer: ReportCloser
  ) {}

  submit(reporter: AuthUser, input: SubmitReportInput): Promise<SubmitReportResult> {
    return this.reports.create(reporter, {
      targetType: input.targetType as ReportTargetTypeValue,
      targetId: input.targetId,
      reason: input.reason as ReportReasonValue,
      description: input.description,
    });
  }

  async closeOpenByTarget(input: CloseReportsInput): Promise<{ closedCount: number }> {
    const groupKey = buildGroupKey(input.targetType as ReportTargetTypeValue, input.targetId);
    const [representative] = await this.repo.findByGroupKey(groupKey, "OPEN");
    if (!representative) return { closedCount: 0 };
    try {
      const closed = await this.closer.close({
        representative,
        actor: input.actor,
        level: input.level === "SCOPE" ? "SCOPE" : "PLATFORM_ONLY",
        status: input.resolution === "NO_ACTION" ? "DISMISSED" : "RESOLVED",
        resolution: input.resolution,
        reason: input.reason,
        auditAction: "report.resolve",
        action: input.resolution === "NO_ACTION" ? "DISMISS" : "HIDE_CONTENT",
      });
      return { closedCount: closed.closedCount };
    } catch (err) {
      // Người khác đã đóng nhóm này trước (MOD_001) — không có gì để làm thêm, không làm hỏng hành động chính (ẩn bộ).
      if (err instanceof AppError && err.errorCode === ErrorCode.MOD_001) return { closedCount: 0 };
      throw err;
    }
  }
}
