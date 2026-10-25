import { prisma } from "../../../infrastructure/database";
import { decodeOffsetCursor, encodeOffsetCursor } from "../../../core/utils/cursor";
import type { CursorResponse } from "../../../core/utils/response";
import type { SpanRange } from "../lib/types";

export interface SectionRow {
  id: string;
  scanId: string;
  targetResourceId: string;
  sourceResourceId: string;
  order: number;
  target: SpanRange;
  source: SpanRange;
  similarity: number;
  matchedHashes: number;
}

export interface CreateSectionInput {
  scanId: string;
  targetResourceId: string;
  sourceResourceId: string;
  order: number;
  target: SpanRange;
  source: SpanRange;
  similarity: number;
  matchedHashes: number;
}

export interface IPlagiarismSectionRepository {
  createMany(rows: CreateSectionInput[]): Promise<void>;
  deleteByTarget(scanId: string, targetResourceId: string): Promise<void>;
  /** Xoá TOÀN BỘ đoạn trùng của một lượt quét theo lô (cron `plagiarism.scans-expire`). Trả số dòng đã xoá. */
  deleteByScanBatch(scanId: string, batch: number): Promise<number>;
  /** Danh sách đoạn trùng của MỘT đích, phân trang theo `order` (mảng nhỏ theo tài liệu — cursor số nguyên đơn giản đủ dùng). */
  listByTarget(params: { scanId: string; targetResourceId: string; cursor?: string; limit: number; sourceResourceId?: string }): Promise<CursorResponse<SectionRow>>;
  findById(scanId: string, sectionId: string): Promise<SectionRow | null>;
  countByTarget(scanId: string, targetResourceId: string): Promise<number>;
}

export class PrismaSectionRepository implements IPlagiarismSectionRepository {
  async createMany(rows: CreateSectionInput[]): Promise<void> {
    if (rows.length === 0) return;
    await prisma.plagiarismSection.createMany({ data: rows });
  }

  async deleteByTarget(scanId: string, targetResourceId: string): Promise<void> {
    await prisma.plagiarismSection.deleteMany({ where: { scanId, targetResourceId } });
  }

  async deleteByScanBatch(scanId: string, batch: number): Promise<number> {
    const rows = await prisma.plagiarismSection.findMany({ where: { scanId }, select: { id: true }, take: batch });
    if (rows.length === 0) return 0;
    await prisma.plagiarismSection.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    return rows.length;
  }

  async listByTarget(params: { scanId: string; targetResourceId: string; cursor?: string; limit: number; sourceResourceId?: string }): Promise<CursorResponse<SectionRow>> {
    const offset = decodeOffsetCursor(params.cursor);
    const rows = await prisma.plagiarismSection.findMany({
      where: { scanId: params.scanId, targetResourceId: params.targetResourceId, ...(params.sourceResourceId && { sourceResourceId: params.sourceResourceId }) },
      orderBy: { order: "asc" },
      skip: offset,
      take: params.limit + 1,
    });
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    return { data: page, meta: { nextCursor: hasMore ? encodeOffsetCursor(offset + params.limit) : null, hasMore, limit: params.limit } };
  }

  findById(scanId: string, sectionId: string): Promise<SectionRow | null> {
    return prisma.plagiarismSection.findFirst({ where: { id: sectionId, scanId } });
  }

  countByTarget(scanId: string, targetResourceId: string): Promise<number> {
    return prisma.plagiarismSection.count({ where: { scanId, targetResourceId } });
  }
}
