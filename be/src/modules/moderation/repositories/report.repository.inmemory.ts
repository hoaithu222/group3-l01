import type { Prisma } from "@prisma/client";
import { newObjectId } from "../../../core/utils/object-id";
import type { Report, ReportCreateInput, ReportStatusValue, ReportTargetTypeValue } from "../entities/report.interface";
import {
  ReportDuplicateError,
  type CloseGroupPatch,
  type IReportRepository,
  type ReportScanFilter,
  type TxAuditEntry,
} from "./report.repository.interface";

/** Repository in-memory cho unit test — cùng ngữ nghĩa với bản Prisma (unique, `scan` theo phạm vi, `closeGroup` chỉ đóng OPEN). */
export class InMemoryReportRepository implements IReportRepository {
  readonly reports: Report[] = [];
  readonly audits: TxAuditEntry[] = [];

  async findById(id: string): Promise<Report | null> {
    return this.reports.find((r) => r.id === id) ?? null;
  }

  async findByUnique(reporterId: string, targetType: ReportTargetTypeValue, targetId: string): Promise<Report | null> {
    return this.reports.find((r) => r.reporterId === reporterId && r.targetType === targetType && r.targetId === targetId) ?? null;
  }

  async findByGroupKey(groupKey: string, status?: ReportStatusValue): Promise<Report[]> {
    return this.newestFirst(this.reports.filter((r) => r.groupKey === groupKey && (!status || r.status === status)));
  }

  async create(_tx: Prisma.TransactionClient, input: ReportCreateInput): Promise<Report> {
    if (await this.findByUnique(input.reporterId, input.targetType, input.targetId)) throw new ReportDuplicateError();
    const now = new Date(Date.now() + this.reports.length); // đơn điệu tăng → thứ tự ổn định trong test
    const report: Report = {
      ...input,
      id: newObjectId(),
      status: "OPEN",
      resolution: null,
      resolutionNote: null,
      resolvedBy: null,
      resolvedAtLevel: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.reports.push(report);
    return report;
  }

  async listByReporter(reporterId: string, cursor: { at: Date; id: string } | null, limit: number): Promise<Report[]> {
    const rows = this.newestFirst(this.reports.filter((r) => r.reporterId === reporterId));
    const after = cursor
      ? rows.filter((r) => r.createdAt < cursor.at || (r.createdAt.getTime() === cursor.at.getTime() && r.id < cursor.id))
      : rows;
    return after.slice(0, limit);
  }

  async scan(filter: ReportScanFilter, limit: number): Promise<Report[]> {
    const { scopes } = filter;
    const matched = this.reports.filter((r) => {
      if (filter.status && r.status !== filter.status) return false;
      if (filter.targetType && r.targetType !== filter.targetType) return false;
      if (filter.handlerLevel && r.handlerLevel !== filter.handlerLevel) return false;
      if (filter.workspaceId && r.workspaceId !== filter.workspaceId) return false;
      if (filter.reason && r.reason !== filter.reason) return false;
      if (filter.from && r.createdAt < filter.from) return false;
      if (filter.to && r.createdAt > filter.to) return false;
      if (!scopes) return true;
      return (
        (!r.scopeIsPrivate && r.workspaceId !== null && scopes.workspaceIds.includes(r.workspaceId)) ||
        (r.scopeIsPrivate && r.scopeType === "CHANNEL" && r.scopeId !== null && scopes.channelIds.includes(r.scopeId)) ||
        (r.scopeIsPrivate && r.scopeType === "CONVERSATION" && r.scopeId !== null && scopes.conversationIds.includes(r.scopeId))
      );
    });
    return this.newestFirst(matched).slice(0, limit);
  }

  async closeGroup(_tx: Prisma.TransactionClient, groupKey: string, patch: CloseGroupPatch): Promise<number> {
    let count = 0;
    for (const r of this.reports) {
      if (r.groupKey !== groupKey || r.status !== "OPEN") continue;
      Object.assign(r, patch, { updatedAt: new Date() });
      count += 1;
    }
    return count;
  }

  async countByAuthor(authorId: string, since: Date): Promise<number> {
    return this.reports.filter((r) => r.targetAuthorId === authorId && r.createdAt >= since).length;
  }

  async countRemovedByAuthor(authorId: string, since: Date): Promise<number> {
    return this.reports.filter(
      (r) => r.targetAuthorId === authorId && r.resolution === "CONTENT_REMOVED" && r.resolvedAt !== null && r.resolvedAt >= since
    ).length;
  }

  async listRecentByAuthor(authorId: string, limit: number): Promise<Report[]> {
    return this.newestFirst(this.reports.filter((r) => r.targetAuthorId === authorId)).slice(0, limit);
  }

  async recordAudit(_tx: Prisma.TransactionClient, entry: TxAuditEntry): Promise<void> {
    this.audits.push(entry);
  }

  private newestFirst(rows: Report[]): Report[] {
    return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
  }
}
