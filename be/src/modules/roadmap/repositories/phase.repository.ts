import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { RoadmapPhase, RoadmapPhaseCreateInput, RoadmapPhasePatch } from "../entities/subject.interface";
import type { TxHandle } from "./tx";

type PhaseRecord = Awaited<ReturnType<typeof prisma.roadmapPhase.findFirstOrThrow>>;

function toPhase(r: PhaseRecord): RoadmapPhase {
  return {
    id: r.id,
    subjectId: r.subjectId,
    index: r.index,
    title: r.title,
    summary: r.summary,
    stageLabel: r.stageLabel,
    color: r.color,
    capstone: r.capstone,
    order: r.order,
    lessonCount: r.lessonCount,
    version: r.version,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export interface IRoadmapPhaseRepository {
  findById(id: string, tx?: TxHandle): Promise<RoadmapPhase | null>;
  listBySubject(subjectId: string, tx?: TxHandle): Promise<RoadmapPhase[]>;
  create(input: RoadmapPhaseCreateInput, tx?: TxHandle): Promise<RoadmapPhase>;
  updateIf(id: string, expectedVersion: number, patch: RoadmapPhasePatch, tx?: TxHandle): Promise<RoadmapPhase | null>;
  count(subjectId: string): Promise<number>;
  /** Order lớn nhất hiện có (null = chưa có tháng nào) — thêm mới nối vào cuối. */
  maxOrder(subjectId: string): Promise<number | null>;
  maxIndex(subjectId: string): Promise<number>;
}

export class PrismaRoadmapPhaseRepository implements IRoadmapPhaseRepository {
  async findById(id: string, tx?: TxHandle): Promise<RoadmapPhase | null> {
    const r = await (tx ?? prisma).roadmapPhase.findUnique({ where: { id } });
    return r && r.deletedAt === null ? toPhase(r) : null;
  }

  async listBySubject(subjectId: string, tx?: TxHandle): Promise<RoadmapPhase[]> {
    const rows = await (tx ?? prisma).roadmapPhase.findMany({ where: { subjectId, deletedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }] });
    return rows.map(toPhase);
  }

  async create(input: RoadmapPhaseCreateInput, tx?: TxHandle): Promise<RoadmapPhase> {
    const r = await (tx ?? prisma).roadmapPhase.create({
      data: {
        subjectId: input.subjectId,
        index: input.index,
        title: input.title,
        summary: input.summary ?? null,
        stageLabel: input.stageLabel ?? null,
        color: input.color ?? null,
        capstone: input.capstone ?? null,
        order: input.order,
        lessonCount: 0,
        version: 1,
        deletedAt: null,
      },
    });
    return toPhase(r);
  }

  async updateIf(id: string, expectedVersion: number, patch: RoadmapPhasePatch, tx?: TxHandle): Promise<RoadmapPhase | null> {
    const db = tx ?? prisma;
    const data: Record<string, unknown> = { version: { increment: 1 } };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) data[k] = v;
    const result = await db.roadmapPhase.updateMany({ where: { id, version: expectedVersion, deletedAt: null }, data: data as Prisma.RoadmapPhaseUncheckedUpdateManyInput });
    return result.count === 0 ? null : this.findById(id, tx);
  }

  count(subjectId: string): Promise<number> {
    return prisma.roadmapPhase.count({ where: { subjectId, deletedAt: null } });
  }

  async maxOrder(subjectId: string): Promise<number | null> {
    const top = await prisma.roadmapPhase.findFirst({ where: { subjectId, deletedAt: null }, orderBy: { order: "desc" }, select: { order: true } });
    return top?.order ?? null;
  }

  async maxIndex(subjectId: string): Promise<number> {
    const top = await prisma.roadmapPhase.findFirst({ where: { subjectId, deletedAt: null }, orderBy: { index: "desc" }, select: { index: true } });
    return top?.index ?? 0;
  }
}
