import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { RoadmapMedia, RoadmapMediaCreateInput, RoadmapMediaPatch } from "../entities/media.interface";
import type { TxHandle } from "./tx";

type MediaRecord = Awaited<ReturnType<typeof prisma.roadmapMedia.findFirstOrThrow>>;

function toMedia(r: MediaRecord): RoadmapMedia {
  return {
    id: r.id,
    lessonId: r.lessonId,
    subjectId: r.subjectId,
    kind: r.kind,
    group: r.group,
    caption: r.caption,
    svg: r.svg,
    assetId: r.assetId,
    width: r.width,
    height: r.height,
    sourcePath: r.sourcePath,
    order: r.order,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export interface IRoadmapMediaRepository {
  findById(id: string): Promise<RoadmapMedia | null>;
  listByLesson(lessonId: string, tx?: TxHandle): Promise<RoadmapMedia[]>;
  create(input: RoadmapMediaCreateInput, tx?: TxHandle): Promise<RoadmapMedia>;
  update(id: string, patch: RoadmapMediaPatch): Promise<RoadmapMedia | null>;
  maxOrder(lessonId: string): Promise<number | null>;
  count(lessonId: string): Promise<number>;
}

export class PrismaRoadmapMediaRepository implements IRoadmapMediaRepository {
  async findById(id: string): Promise<RoadmapMedia | null> {
    const r = await prisma.roadmapMedia.findUnique({ where: { id } });
    return r && r.deletedAt === null ? toMedia(r) : null;
  }

  async listByLesson(lessonId: string, tx?: TxHandle): Promise<RoadmapMedia[]> {
    const rows = await (tx ?? prisma).roadmapMedia.findMany({ where: { lessonId, deletedAt: null }, orderBy: [{ order: "asc" }, { id: "asc" }] });
    return rows.map(toMedia);
  }

  async create(input: RoadmapMediaCreateInput, tx?: TxHandle): Promise<RoadmapMedia> {
    const r = await (tx ?? prisma).roadmapMedia.create({
      data: {
        lessonId: input.lessonId,
        subjectId: input.subjectId,
        kind: input.kind,
        group: input.group ?? null,
        caption: input.caption ?? null,
        svg: input.svg ?? null,
        assetId: input.assetId ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        sourcePath: input.sourcePath ?? null,
        order: input.order,
        deletedAt: null,
      },
    });
    return toMedia(r);
  }

  async update(id: string, patch: RoadmapMediaPatch): Promise<RoadmapMedia | null> {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) data[k] = v;
    if (Object.keys(data).length === 0) return this.findById(id);
    const result = await prisma.roadmapMedia.updateMany({ where: { id, deletedAt: null }, data: data as Prisma.RoadmapMediaUncheckedUpdateManyInput });
    return result.count === 0 ? null : this.findById(id);
  }

  async maxOrder(lessonId: string): Promise<number | null> {
    const top = await prisma.roadmapMedia.findFirst({ where: { lessonId, deletedAt: null }, orderBy: { order: "desc" }, select: { order: true } });
    return top?.order ?? null;
  }

  count(lessonId: string): Promise<number> {
    return prisma.roadmapMedia.count({ where: { lessonId, deletedAt: null } });
  }
}
