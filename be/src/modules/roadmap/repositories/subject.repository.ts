import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { RoadmapSubject, RoadmapSubjectCreateInput, RoadmapSubjectPatch, RoadmapSubjectStatusValue } from "../entities/subject.interface";
import type { TxHandle } from "./tx";

type SubjectRecord = Awaited<ReturnType<typeof prisma.roadmapSubject.findFirstOrThrow>>;

function toSubject(r: SubjectRecord): RoadmapSubject {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    normalizedTitle: r.normalizedTitle,
    description: r.description,
    category: r.category,
    color: r.color,
    icon: r.icon,
    coverAssetId: r.coverAssetId,
    lessonLabel: r.lessonLabel,
    defaultStudyDays: r.defaultStudyDays,
    unlockMode: r.unlockMode,
    status: r.status,
    order: r.order,
    phaseCount: r.phaseCount,
    lessonCount: r.lessonCount,
    requiredLessonCount: r.requiredLessonCount,
    sourceRef: r.sourceRef,
    version: r.version,
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
    publishedAt: r.publishedAt,
    archivedAt: r.archivedAt,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export interface RoadmapSubjectListFilter {
  /** Thiếu = mọi trạng thái (dùng ở admin); người học truyền `["PUBLISHED"]`. */
  status?: readonly RoadmapSubjectStatusValue[];
  q?: string;
}

export interface IRoadmapSubjectRepository {
  findById(id: string, tx?: TxHandle): Promise<RoadmapSubject | null>;
  /** `idOrSlug` là ObjectId (24 hex) → tra theo id; ngược lại tra theo `slug`. */
  findBySlugOrId(idOrSlug: string): Promise<RoadmapSubject | null>;
  list(filter: RoadmapSubjectListFilter): Promise<RoadmapSubject[]>;
  create(input: RoadmapSubjectCreateInput, tx?: TxHandle): Promise<RoadmapSubject>;
  updateIf(id: string, expectedVersion: number, patch: RoadmapSubjectPatch, tx?: TxHandle): Promise<RoadmapSubject | null>;
  count(): Promise<number>;
}

export class PrismaRoadmapSubjectRepository implements IRoadmapSubjectRepository {
  async findById(id: string, tx?: TxHandle): Promise<RoadmapSubject | null> {
    const r = await (tx ?? prisma).roadmapSubject.findUnique({ where: { id } });
    return r && r.deletedAt === null ? toSubject(r) : null;
  }

  async findBySlugOrId(idOrSlug: string): Promise<RoadmapSubject | null> {
    const r = OBJECT_ID.test(idOrSlug)
      ? await prisma.roadmapSubject.findUnique({ where: { id: idOrSlug } })
      : await prisma.roadmapSubject.findUnique({ where: { slug: idOrSlug } });
    return r && r.deletedAt === null ? toSubject(r) : null;
  }

  async list(filter: RoadmapSubjectListFilter): Promise<RoadmapSubject[]> {
    const where: Prisma.RoadmapSubjectWhereInput = {
      deletedAt: null,
      ...(filter.status && { status: { in: [...filter.status] } }),
      ...(filter.q && { normalizedTitle: { contains: filter.q } }),
    };
    const rows = await prisma.roadmapSubject.findMany({ where, orderBy: [{ order: "asc" }, { id: "asc" }] });
    return rows.map(toSubject);
  }

  async create(input: RoadmapSubjectCreateInput, tx?: TxHandle): Promise<RoadmapSubject> {
    const r = await (tx ?? prisma).roadmapSubject.create({
      data: {
        slug: input.slug,
        title: input.title,
        normalizedTitle: input.normalizedTitle,
        description: input.description ?? null,
        category: input.category,
        color: input.color ?? null,
        icon: input.icon ?? null,
        coverAssetId: null,
        lessonLabel: input.lessonLabel,
        defaultStudyDays: input.defaultStudyDays,
        unlockMode: input.unlockMode,
        status: "DRAFT",
        order: input.order,
        phaseCount: 0,
        lessonCount: 0,
        requiredLessonCount: 0,
        sourceRef: input.sourceRef ?? null,
        version: 1,
        createdBy: input.createdBy,
        updatedBy: null,
        publishedAt: null,
        archivedAt: null,
        deletedAt: null,
      },
    });
    return toSubject(r);
  }

  async updateIf(id: string, expectedVersion: number, patch: RoadmapSubjectPatch, tx?: TxHandle): Promise<RoadmapSubject | null> {
    const db = tx ?? prisma;
    const data: Record<string, unknown> = { version: { increment: 1 } };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) data[k] = v;
    const result = await db.roadmapSubject.updateMany({ where: { id, version: expectedVersion, deletedAt: null }, data: data as Prisma.RoadmapSubjectUncheckedUpdateManyInput });
    return result.count === 0 ? null : this.findById(id, tx);
  }

  count(): Promise<number> {
    return prisma.roadmapSubject.count({ where: { deletedAt: null } });
  }
}
