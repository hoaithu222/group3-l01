import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { encodeCursor, decodeCursor } from "../../../core/utils/cursor";
import type { AuthUser } from "../../../core/types/express";
import type { Report, ReportReasonValue, ReportResolutionValue, ReportStatusValue, ReportTargetTypeValue } from "../entities/report.interface";
import type { CreateReportDto, MyReportsQueryDto } from "../dtos";
import { ReportDuplicateError, type IReportRepository } from "../repositories/report.repository.interface";
import type { ReportTargetResolver } from "./report-target.resolver";

export interface CreateReportResult {
  id: string;
  status: ReportStatusValue;
  createdAt: Date;
  /** `true` khi người này đã báo cáo đích này từ trước (idempotent, MOD-01) — controller trả 200 thay vì 201. */
  alreadyReported: boolean;
}

/** Item `GET /me/reports` — KHÔNG có nội dung đích (be.md p1-08 §4). */
export interface MyReportItem {
  id: string;
  targetType: ReportTargetTypeValue;
  reason: ReportReasonValue;
  status: ReportStatusValue;
  resolution: ReportResolutionValue | null;
  createdAt: Date;
}

export interface MyReportsResult {
  data: MyReportItem[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

/**
 * `POST /reports` + `GET /me/reports` (be.md p1-08 §5.2). Idempotent theo
 * `(reporterId, targetType, targetId)`: lần 2 trả bản cũ, KHÔNG tạo mới, KHÔNG phát lại thông báo.
 */
export class ReportService {
  constructor(
    private readonly repo: IReportRepository,
    private readonly resolver: ReportTargetResolver
  ) {}

  async create(reporter: AuthUser, dto: CreateReportDto): Promise<CreateReportResult> {
    const existing = await this.repo.findByUnique(reporter.id, dto.targetType, dto.targetId);
    if (existing) return toResult(existing, true);

    const target = await this.resolver.resolve(reporter, dto);
    const description = dto.description && dto.description.length > 0 ? dto.description : null;

    try {
      const created = await withTransaction(async (tx) => {
        const report = await this.repo.create(tx, {
          reporterId: reporter.id,
          ...target,
          reason: dto.reason,
          description,
        });
        // Consumer `report.events` tự đọc lại `Report` theo id (không nhân đôi dữ liệu nhạy cảm vào outbox).
        await outbox.add(tx, {
          type: "report.created",
          aggregateType: "Report",
          aggregateId: report.id,
          queue: "notifications",
          jobName: "report.events",
          dedupeKey: `report.created:${report.id}`,
          payload: { event: "created", reportId: report.id, groupKey: report.groupKey },
        });
        return report;
      });
      return toResult(created, false);
    } catch (err) {
      // 2 request cùng lúc: transaction thua đã abort — đọc lại NGOÀI transaction, không chạy tiếp trên `tx` cũ.
      if (err instanceof ReportDuplicateError) {
        const raced = await this.repo.findByUnique(reporter.id, dto.targetType, dto.targetId);
        if (raced) return toResult(raced, true);
      }
      throw err;
    }
  }

  async myReports(reporterId: string, query: MyReportsQueryDto): Promise<MyReportsResult> {
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.repo.listByReporter(reporterId, decoded, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return {
      data: page.map((r) => ({
        id: r.id,
        targetType: r.targetType,
        reason: r.reason,
        status: r.status,
        resolution: r.resolution,
        createdAt: r.createdAt,
      })),
      meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore, limit: query.limit },
    };
  }
}

function toResult(report: Report, alreadyReported: boolean): CreateReportResult {
  return { id: report.id, status: report.status, createdAt: report.createdAt, alreadyReported };
}
