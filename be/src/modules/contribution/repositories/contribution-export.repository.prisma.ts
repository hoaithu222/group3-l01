import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { ContributionWeights } from "../../../core/constants/contribution";
import type { ContributionExportRecord, ExportStatus } from "../entities/contribution.interface";
import type { CreateExportInput, IContributionExportRepository } from "./contribution-export.repository.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

type ExportRecord = Prisma.ContributionExportGetPayload<Record<string, never>>;

const toRecord = (r: ExportRecord): ContributionExportRecord => ({
  id: r.id,
  workspaceId: r.workspaceId,
  boardId: r.boardId,
  requestedBy: r.requestedBy,
  periodKey: r.periodKey,
  includeHeatmap: r.includeHeatmap,
  status: r.status as ExportStatus,
  dedupeKey: r.dedupeKey,
  dataHash: r.dataHash,
  verifyCode: r.verifyCode,
  weights: r.weights as unknown as ContributionWeights,
  memberCount: r.memberCount,
  assetId: r.assetId ?? null,
  error: r.error ?? null,
  createdAt: r.createdAt,
  readyAt: r.readyAt ?? null,
  expiresAt: r.expiresAt,
});

export class PrismaContributionExportRepository implements IContributionExportRepository {
  async findById(id: string): Promise<ContributionExportRecord | null> {
    const row = await prisma.contributionExport.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async findByDedupeKey(dedupeKey: string): Promise<ContributionExportRecord | null> {
    const row = await prisma.contributionExport.findUnique({ where: { dedupeKey } });
    return row ? toRecord(row) : null;
  }

  async create(input: CreateExportInput, tx?: TxHandle): Promise<ContributionExportRecord> {
    const row = await (tx ?? prisma).contributionExport.create({
      data: {
        workspaceId: input.workspaceId,
        boardId: input.boardId,
        requestedBy: input.requestedBy,
        periodKey: input.periodKey,
        includeHeatmap: input.includeHeatmap,
        status: "QUEUED",
        dedupeKey: input.dedupeKey,
        dataHash: input.dataHash,
        verifyCode: input.verifyCode,
        weights: input.weights as unknown as Prisma.InputJsonValue,
        memberCount: input.memberCount,
        // Ghi null tường minh (Prisma+Mongo: trường vắng ≠ null).
        assetId: null,
        error: null,
        readyAt: null,
        expiresAt: input.expiresAt,
      },
    });
    return toRecord(row);
  }

  async claimRunning(id: string): Promise<boolean> {
    const result = await prisma.contributionExport.updateMany({ where: { id, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "RUNNING" } });
    return result.count > 0;
  }

  async updateData(id: string, dataHash: string, dedupeKey: string): Promise<boolean> {
    try {
      await prisma.contributionExport.updateMany({ where: { id }, data: { dataHash, dedupeKey } });
      return true;
    } catch (err) {
      if (isPrismaUniqueViolation(err)) return false;
      throw err;
    }
  }

  async markReady(id: string, assetId: string, at: Date): Promise<void> {
    await prisma.contributionExport.updateMany({ where: { id }, data: { status: "READY", assetId, readyAt: at, error: null } });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await prisma.contributionExport.updateMany({ where: { id, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "FAILED", error, dedupeKey: `failed:${id}` } });
  }

  async listDueForExpiry(now: Date, limit: number): Promise<ContributionExportRecord[]> {
    const rows = await prisma.contributionExport.findMany({ where: { status: "READY", expiresAt: { lte: now } }, orderBy: { expiresAt: "asc" }, take: limit });
    return rows.map(toRecord);
  }

  async markExpired(id: string): Promise<boolean> {
    const result = await prisma.contributionExport.updateMany({ where: { id, status: "READY" }, data: { status: "EXPIRED", dedupeKey: `expired:${id}` } });
    return result.count > 0;
  }

  async countByWorkspace(workspaceId: string, since: Date): Promise<{ ready: number; failed: number }> {
    const where = { workspaceId, createdAt: { gte: since } };
    const [ready, failed] = await Promise.all([
      prisma.contributionExport.count({ where: { ...where, status: { in: ["READY", "EXPIRED"] } } }),
      prisma.contributionExport.count({ where: { ...where, status: "FAILED" } }),
    ]);
    return { ready, failed };
  }
}
