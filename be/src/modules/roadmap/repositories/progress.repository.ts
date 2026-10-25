import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { RoadmapLessonProgress, RoadmapLessonProgressPatch } from "../entities/enrollment.interface";
import type { TxHandle } from "./tx";

type ProgressRecord = Awaited<ReturnType<typeof prisma.roadmapLessonProgress.findFirstOrThrow>>;

function toProgress(r: ProgressRecord): RoadmapLessonProgress {
  return {
    id: r.id,
    userId: r.userId,
    subjectId: r.subjectId,
    lessonId: r.lessonId,
    status: r.status,
    checkedItemIds: r.checkedItemIds,
    selfRating: r.selfRating,
    note: r.note,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export interface IRoadmapProgressRepository {
  findByUserAndLesson(userId: string, lessonId: string, tx?: TxHandle): Promise<RoadmapLessonProgress | null>;
  listBySubject(userId: string, subjectId: string): Promise<RoadmapLessonProgress[]>;
  /** Upsert theo `(userId, lessonId)` — tạo mới nếu chưa có, CAS `version` nếu đã có (`expectedVersion` null = không kiểm, dùng cho lần đầu). */
  upsert(userId: string, subjectId: string, lessonId: string, expectedVersion: number | null, patch: RoadmapLessonProgressPatch, tx?: TxHandle): Promise<RoadmapLessonProgress>;
  countCompleted(userId: string, subjectId: string, onlyLessonIds?: readonly string[]): Promise<number>;
}

export class PrismaRoadmapProgressRepository implements IRoadmapProgressRepository {
  async findByUserAndLesson(userId: string, lessonId: string, tx?: TxHandle): Promise<RoadmapLessonProgress | null> {
    const r = await (tx ?? prisma).roadmapLessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
    return r ? toProgress(r) : null;
  }

  async listBySubject(userId: string, subjectId: string): Promise<RoadmapLessonProgress[]> {
    const rows = await prisma.roadmapLessonProgress.findMany({ where: { userId, subjectId } });
    return rows.map(toProgress);
  }

  async upsert(
    userId: string,
    subjectId: string,
    lessonId: string,
    expectedVersion: number | null,
    patch: RoadmapLessonProgressPatch,
    tx?: TxHandle
  ): Promise<RoadmapLessonProgress> {
    const db = tx ?? prisma;
    if (expectedVersion === null) {
      const r = await db.roadmapLessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: {
          userId,
          subjectId,
          lessonId,
          status: patch.status ?? "NOT_STARTED",
          checkedItemIds: patch.checkedItemIds ?? [],
          selfRating: patch.selfRating ?? null,
          note: patch.note ?? null,
          startedAt: patch.startedAt ?? null,
          completedAt: patch.completedAt ?? null,
          version: 1,
        },
        update: { ...cleanPatch(patch), version: { increment: 1 } },
      });
      return toProgress(r);
    }
    const result = await db.roadmapLessonProgress.updateMany({
      where: { userId, lessonId, version: expectedVersion },
      data: { ...cleanPatch(patch), version: { increment: 1 } } as Prisma.RoadmapLessonProgressUncheckedUpdateManyInput,
    });
    if (result.count === 0) throw new Error("PROGRESS_VERSION_CONFLICT");
    return (await this.findByUserAndLesson(userId, lessonId, tx)) as RoadmapLessonProgress;
  }

  countCompleted(userId: string, subjectId: string, onlyLessonIds?: readonly string[]): Promise<number> {
    return prisma.roadmapLessonProgress.count({
      where: { userId, subjectId, status: "COMPLETED", ...(onlyLessonIds && { lessonId: { in: [...onlyLessonIds] } }) },
    });
  }
}

function cleanPatch(patch: RoadmapLessonProgressPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
  return out;
}
