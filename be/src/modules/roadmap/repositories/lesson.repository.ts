import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { BLOCKS_FORMAT_VERSION, type Block } from "../entities/block.interface";
import type { RoadmapLesson, RoadmapLessonCreateInput, RoadmapLessonPatch } from "../entities/lesson.interface";
import type { TxHandle } from "./tx";

type LessonRecord = Awaited<ReturnType<typeof prisma.roadmapLesson.findFirstOrThrow>>;

function toLesson(r: LessonRecord): RoadmapLesson {
  return {
    id: r.id,
    subjectId: r.subjectId,
    phaseId: r.phaseId,
    slug: r.slug,
    number: r.number,
    title: r.title,
    normalizedTitle: r.normalizedTitle,
    summary: r.summary,
    durationMinutes: r.durationMinutes,
    prerequisites: r.prerequisites,
    objectives: r.objectives,
    bodyMd: r.bodyMd,
    blocks: r.blocks as unknown as Block[],
    blocksFormat: r.blocksFormat,
    checklist: r.checklist,
    resources: r.resources,
    practiceSetIds: r.practiceSetIds,
    mediaCount: r.mediaCount,
    optional: r.optional,
    published: r.published,
    order: r.order,
    version: r.version,
    updatedBy: r.updatedBy,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export interface RoadmapLessonListFilter {
  subjectId?: string;
  phaseId?: string;
  /** Thiếu = mọi trạng thái xuất bản (admin); người học truyền `true`. */
  publishedOnly?: boolean;
}

export interface IRoadmapLessonRepository {
  findById(id: string, tx?: TxHandle): Promise<RoadmapLesson | null>;
  findBySlug(slug: string): Promise<RoadmapLesson | null>;
  list(filter: RoadmapLessonListFilter): Promise<RoadmapLesson[]>;
  create(input: RoadmapLessonCreateInput, tx?: TxHandle): Promise<RoadmapLesson>;
  updateIf(id: string, expectedVersion: number, patch: RoadmapLessonPatch, tx?: TxHandle): Promise<RoadmapLesson | null>;
  /** Ghi đè KHÔNG kiểm version — chỉ dùng cho import (idempotent theo slug, không có người dùng đang sửa cùng lúc). */
  overwrite(id: string, patch: RoadmapLessonPatch, tx?: TxHandle): Promise<RoadmapLesson>;
  maxNumber(subjectId: string): Promise<number>;
  countBySubject(subjectId: string, publishedOnly: boolean): Promise<number>;
  countByPhase(phaseId: string): Promise<number>;
  /** Đánh lại `number` 1..n theo `order` hiện tại của mọi buổi trong môn (sau khi sắp xếp). */
  renumber(subjectId: string, tx?: TxHandle): Promise<void>;
}

export class PrismaRoadmapLessonRepository implements IRoadmapLessonRepository {
  async findById(id: string, tx?: TxHandle): Promise<RoadmapLesson | null> {
    const r = await (tx ?? prisma).roadmapLesson.findUnique({ where: { id } });
    return r && r.deletedAt === null ? toLesson(r) : null;
  }

  async findBySlug(slug: string): Promise<RoadmapLesson | null> {
    const r = await prisma.roadmapLesson.findUnique({ where: { slug } });
    return r && r.deletedAt === null ? toLesson(r) : null;
  }

  async list(filter: RoadmapLessonListFilter): Promise<RoadmapLesson[]> {
    const where: Prisma.RoadmapLessonWhereInput = {
      deletedAt: null,
      ...(filter.subjectId && { subjectId: filter.subjectId }),
      ...(filter.phaseId && { phaseId: filter.phaseId }),
      ...(filter.publishedOnly && { published: true }),
    };
    const rows = await prisma.roadmapLesson.findMany({ where, orderBy: [{ order: "asc" }, { id: "asc" }] });
    return rows.map(toLesson);
  }

  async create(input: RoadmapLessonCreateInput, tx?: TxHandle): Promise<RoadmapLesson> {
    const r = await (tx ?? prisma).roadmapLesson.create({
      data: {
        subjectId: input.subjectId,
        phaseId: input.phaseId,
        slug: input.slug,
        number: input.number,
        title: input.title,
        normalizedTitle: input.normalizedTitle,
        summary: input.summary ?? null,
        durationMinutes: input.durationMinutes ?? null,
        prerequisites: input.prerequisites ?? null,
        objectives: input.objectives,
        bodyMd: input.bodyMd,
        blocks: input.blocks as unknown as Prisma.InputJsonValue,
        blocksFormat: BLOCKS_FORMAT_VERSION,
        checklist: input.checklist,
        resources: input.resources,
        practiceSetIds: input.practiceSetIds,
        mediaCount: 0,
        optional: input.optional,
        published: input.published ?? false,
        order: input.order,
        version: 1,
        updatedBy: input.updatedBy ?? null,
        deletedAt: null,
      },
    });
    return toLesson(r);
  }

  async updateIf(id: string, expectedVersion: number, patch: RoadmapLessonPatch, tx?: TxHandle): Promise<RoadmapLesson | null> {
    const db = tx ?? prisma;
    const data = patchData(patch);
    data.version = { increment: 1 };
    const result = await db.roadmapLesson.updateMany({ where: { id, version: expectedVersion, deletedAt: null }, data: data as Prisma.RoadmapLessonUncheckedUpdateManyInput });
    return result.count === 0 ? null : this.findById(id, tx);
  }

  async overwrite(id: string, patch: RoadmapLessonPatch, tx?: TxHandle): Promise<RoadmapLesson> {
    const db = tx ?? prisma;
    const data = patchData(patch);
    data.version = { increment: 1 };
    const r = await db.roadmapLesson.update({ where: { id }, data: data as Prisma.RoadmapLessonUncheckedUpdateInput });
    return toLesson(r);
  }

  async maxNumber(subjectId: string): Promise<number> {
    const top = await prisma.roadmapLesson.findFirst({ where: { subjectId, deletedAt: null }, orderBy: { number: "desc" }, select: { number: true } });
    return top?.number ?? 0;
  }

  countBySubject(subjectId: string, publishedOnly: boolean): Promise<number> {
    return prisma.roadmapLesson.count({ where: { subjectId, deletedAt: null, ...(publishedOnly && { published: true }) } });
  }

  countByPhase(phaseId: string): Promise<number> {
    return prisma.roadmapLesson.count({ where: { phaseId, deletedAt: null } });
  }

  async renumber(subjectId: string, tx?: TxHandle): Promise<void> {
    const db = tx ?? prisma;
    const rows = await db.roadmapLesson.findMany({ where: { subjectId, deletedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, number: true } });
    for (let i = 0; i < rows.length; i++) {
      const wanted = i + 1;
      if (rows[i].number !== wanted) await db.roadmapLesson.update({ where: { id: rows[i].id }, data: { number: wanted } });
    }
  }
}

/** Chỉ khoá có mặt trong `patch` được ghi (`undefined` = giữ nguyên, `null` = xoá — quy ước Mongo null-vs-absent đã ghi tường minh trong entity). */
function patchData(patch: RoadmapLessonPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = key === "blocks" ? (value as unknown as Prisma.InputJsonValue) : value;
  }
  return out;
}
