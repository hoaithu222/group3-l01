import type { Prisma, PlagiarismScanMode, PlagiarismScanStatus } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { CursorResponse } from "../../../core/utils/response";
import type { TxHandle } from "./tx";

export interface ScanRow {
  id: string;
  workspaceId: string;
  requestedBy: string;
  mode: PlagiarismScanMode;
  targetResourceIds: string[];
  excludeResourceIds: string[];
  excludeFolderIds: string[];
  note: string | null;
  status: PlagiarismScanStatus;
  progress: number;
  algoVersion: number;
  configSnapshot: unknown;
  failureCode: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  expiresAt: Date;
  deletedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScanInput {
  workspaceId: string;
  requestedBy: string;
  mode: PlagiarismScanMode;
  targetResourceIds: string[];
  excludeResourceIds: string[];
  excludeFolderIds: string[];
  note: string | null;
  algoVersion: number;
  configSnapshot: Record<string, unknown>;
  expiresAt: Date;
}

const ACTIVE_STATUSES: PlagiarismScanStatus[] = ["QUEUED", "INDEXING", "SCANNING"];

export interface IScanRepository {
  create(tx: TxHandle, input: CreateScanInput): Promise<ScanRow>;
  findById(id: string): Promise<ScanRow | null>;
  list(params: { workspaceId: string; cursor?: string; limit: number; status?: PlagiarismScanStatus }): Promise<CursorResponse<ScanRow>>;
  countActive(workspaceId: string): Promise<number>;
  countCreatedSince(workspaceId: string, since: Date): Promise<number>;
  update(id: string, data: Prisma.PlagiarismScanUpdateInput): Promise<ScanRow>;
  /** Cập nhật CÓ ĐIỀU KIỆN trạng thái hiện tại — trả `null` nếu không còn khớp (đã bị job khác đổi). */
  updateIfStatus(id: string, fromStatuses: PlagiarismScanStatus[], data: Prisma.PlagiarismScanUpdateInput): Promise<ScanRow | null>;
  softDelete(id: string, at: Date): Promise<void>;
  findExpired(now: Date, batch: number): Promise<string[]>;
  markExpired(ids: string[]): Promise<void>;
  findStuckScanning(before: Date, batch: number): Promise<string[]>;
}

export class PrismaScanRepository implements IScanRepository {
  create(tx: TxHandle, input: CreateScanInput): Promise<ScanRow> {
    return tx.plagiarismScan.create({
      data: {
        workspaceId: input.workspaceId,
        requestedBy: input.requestedBy,
        mode: input.mode,
        targetResourceIds: input.targetResourceIds,
        excludeResourceIds: input.excludeResourceIds,
        excludeFolderIds: input.excludeFolderIds,
        note: input.note,
        algoVersion: input.algoVersion,
        configSnapshot: input.configSnapshot as Prisma.InputJsonValue,
        expiresAt: input.expiresAt,
      },
    });
  }

  findById(id: string): Promise<ScanRow | null> {
    return prisma.plagiarismScan.findUnique({ where: { id } });
  }

  async list(params: { workspaceId: string; cursor?: string; limit: number; status?: PlagiarismScanStatus }): Promise<CursorResponse<ScanRow>> {
    const decoded = params.cursor ? decodeCursor(params.cursor) : null;
    const rows = await prisma.plagiarismScan.findMany({
      where: {
        workspaceId: params.workspaceId,
        deletedAt: null,
        ...(params.status && { status: params.status }),
        ...(decoded && { OR: [{ createdAt: { lt: decoded.at } }, { createdAt: decoded.at, id: { lt: decoded.id } }] }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page[page.length - 1];
    return { data: page, meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore, limit: params.limit } };
  }

  countActive(workspaceId: string): Promise<number> {
    return prisma.plagiarismScan.count({ where: { workspaceId, deletedAt: null, status: { in: ACTIVE_STATUSES } } });
  }

  countCreatedSince(workspaceId: string, since: Date): Promise<number> {
    return prisma.plagiarismScan.count({ where: { workspaceId, createdAt: { gte: since } } });
  }

  update(id: string, data: Prisma.PlagiarismScanUpdateInput): Promise<ScanRow> {
    return prisma.plagiarismScan.update({ where: { id }, data });
  }

  async updateIfStatus(id: string, fromStatuses: PlagiarismScanStatus[], data: Prisma.PlagiarismScanUpdateInput): Promise<ScanRow | null> {
    const result = await prisma.plagiarismScan.updateMany({ where: { id, status: { in: fromStatuses } }, data });
    if (result.count === 0) return null;
    return prisma.plagiarismScan.findUnique({ where: { id } });
  }

  async softDelete(id: string, at: Date): Promise<void> {
    await prisma.plagiarismScan.update({ where: { id }, data: { deletedAt: at } });
  }

  async findExpired(now: Date, batch: number): Promise<string[]> {
    const rows = await prisma.plagiarismScan.findMany({
      where: { expiresAt: { lte: now }, status: { notIn: ["EXPIRED"] }, deletedAt: null },
      select: { id: true },
      take: batch,
    });
    return rows.map((r) => r.id);
  }

  async markExpired(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await prisma.plagiarismScan.updateMany({ where: { id: { in: ids } }, data: { status: "EXPIRED" } });
  }

  async findStuckScanning(before: Date, batch: number): Promise<string[]> {
    const rows = await prisma.plagiarismScan.findMany({
      where: { status: "SCANNING", updatedAt: { lt: before }, deletedAt: null },
      select: { id: true },
      take: batch,
    });
    return rows.map((r) => r.id);
  }
}
