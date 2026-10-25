import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { Report, ReportCreateInput, ReportStatusValue, ReportTargetTypeValue } from "../entities/report.interface";
import {
  ReportDuplicateError,
  type CloseGroupPatch,
  type IReportRepository,
  type ReportScanFilter,
  type ReportScopeFilter,
  type TxAuditEntry,
} from "./report.repository.interface";

function scopeConditions(scopes: ReportScopeFilter): Prisma.ReportWhereInput[] {
  const conditions: Prisma.ReportWhereInput[] = [];
  // Báo cáo public trong workspace (kênh public/USER có ngữ cảnh/CHANNEL public) — `scopeIsPrivate=false`.
  if (scopes.workspaceIds.length > 0) conditions.push({ workspaceId: { in: scopes.workspaceIds }, scopeIsPrivate: false });
  if (scopes.channelIds.length > 0) {
    conditions.push({ scopeType: "CHANNEL", scopeId: { in: scopes.channelIds }, scopeIsPrivate: true });
  }
  if (scopes.conversationIds.length > 0) {
    conditions.push({ scopeType: "CONVERSATION", scopeId: { in: scopes.conversationIds }, scopeIsPrivate: true });
  }
  return conditions;
}

function scanWhere(filter: ReportScanFilter): Prisma.ReportWhereInput {
  return {
    ...(filter.status && { status: filter.status }),
    ...(filter.targetType && { targetType: filter.targetType }),
    ...(filter.handlerLevel && { handlerLevel: filter.handlerLevel }),
    ...(filter.workspaceId && { workspaceId: filter.workspaceId }),
    ...(filter.reason && { reason: filter.reason }),
    ...((filter.from || filter.to) && {
      createdAt: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: filter.to }) },
    }),
    // `OR: []` khớp KHÔNG bản ghi nào (Prisma) — người xem không có phạm vi nào → danh sách rỗng, đúng ý.
    ...(filter.scopes && { OR: scopeConditions(filter.scopes) }),
  };
}

export class PrismaReportRepository implements IReportRepository {
  async findById(id: string): Promise<Report | null> {
    return prisma.report.findUnique({ where: { id } });
  }

  async findByUnique(reporterId: string, targetType: ReportTargetTypeValue, targetId: string): Promise<Report | null> {
    return prisma.report.findUnique({ where: { reporterId_targetType_targetId: { reporterId, targetType, targetId } } });
  }

  async findByGroupKey(groupKey: string, status?: ReportStatusValue): Promise<Report[]> {
    return prisma.report.findMany({ where: { groupKey, ...(status && { status }) }, orderBy: { createdAt: "desc" } });
  }

  async create(tx: Prisma.TransactionClient, input: ReportCreateInput): Promise<Report> {
    try {
      return await tx.report.create({
        data: {
          ...input,
          status: "OPEN",
          // Ghi TƯỜNG MINH null — `closeGroup`/bộ lọc sau này không khớp field vắng mặt (bẫy Prisma-Mongo).
          resolution: null,
          resolutionNote: null,
          resolvedBy: null,
          resolvedAtLevel: null,
          resolvedAt: null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ReportDuplicateError();
      throw err;
    }
  }

  async listByReporter(reporterId: string, cursor: { at: Date; id: string } | null, limit: number): Promise<Report[]> {
    return prisma.report.findMany({
      where: {
        reporterId,
        ...(cursor && { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
  }

  async scan(filter: ReportScanFilter, limit: number): Promise<Report[]> {
    return prisma.report.findMany({ where: scanWhere(filter), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
  }

  async closeGroup(tx: Prisma.TransactionClient, groupKey: string, patch: CloseGroupPatch): Promise<number> {
    const result = await tx.report.updateMany({
      where: { groupKey, status: "OPEN" },
      data: {
        status: patch.status,
        resolution: patch.resolution,
        resolvedBy: patch.resolvedBy,
        resolvedAtLevel: patch.resolvedAtLevel,
        resolvedAt: patch.resolvedAt,
        resolutionNote: patch.resolutionNote,
      },
    });
    return result.count;
  }

  async countByAuthor(authorId: string, since: Date): Promise<number> {
    return prisma.report.count({ where: { targetAuthorId: authorId, createdAt: { gte: since } } });
  }

  async countRemovedByAuthor(authorId: string, since: Date): Promise<number> {
    return prisma.report.count({
      where: { targetAuthorId: authorId, status: "RESOLVED", resolution: "CONTENT_REMOVED", resolvedAt: { gte: since } },
    });
  }

  async listRecentByAuthor(authorId: string, limit: number): Promise<Report[]> {
    return prisma.report.findMany({ where: { targetAuthorId: authorId }, orderBy: { createdAt: "desc" }, take: limit });
  }

  async recordAudit(tx: Prisma.TransactionClient, entry: TxAuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId,
        actorRole: entry.actorRole ?? "unknown",
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        workspaceId: entry.workspaceId,
        reason: entry.reason,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
