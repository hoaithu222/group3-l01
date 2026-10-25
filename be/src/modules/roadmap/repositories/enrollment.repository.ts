import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { RoadmapEnrollment, RoadmapEnrollmentCreateInput, RoadmapEnrollmentPatch } from "../entities/enrollment.interface";
import type { TxHandle } from "./tx";

type EnrollmentRecord = Awaited<ReturnType<typeof prisma.roadmapEnrollment.findFirstOrThrow>>;

function toEnrollment(r: EnrollmentRecord): RoadmapEnrollment {
  return {
    id: r.id,
    userId: r.userId,
    subjectId: r.subjectId,
    status: r.status,
    anchorDate: r.anchorDate,
    anchorNumber: r.anchorNumber,
    studyDays: r.studyDays,
    timezone: r.timezone,
    completedCount: r.completedCount,
    requiredDone: r.requiredDone,
    lastLessonId: r.lastLessonId,
    lastActivityAt: r.lastActivityAt,
    rescheduledAt: r.rescheduledAt,
    completedAt: r.completedAt,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export interface IRoadmapEnrollmentRepository {
  findById(id: string): Promise<RoadmapEnrollment | null>;
  findByUserAndSubject(userId: string, subjectId: string, tx?: TxHandle): Promise<RoadmapEnrollment | null>;
  listActiveByUser(userId: string): Promise<RoadmapEnrollment[]>;
  /** Toàn bộ đăng ký ACTIVE (mọi người dùng) — cron nhắc học `roadmap.remind-today` (p4-07 §7, P1). Không phân trang: quy mô người học hiện tại nhỏ. */
  listAllActive(): Promise<RoadmapEnrollment[]>;
  create(input: RoadmapEnrollmentCreateInput, tx?: TxHandle): Promise<RoadmapEnrollment>;
  updateIf(id: string, expectedVersion: number, patch: RoadmapEnrollmentPatch, tx?: TxHandle): Promise<RoadmapEnrollment | null>;
  /**
   * `$inc` NGUYÊN TỬ (không CAS) — đúng cho bộ đếm cộng dồn khi buổi hoàn thành/bỏ hoàn thành, tránh đọc-sửa-ghi đua nhau.
   * `requiredLessonCount` (tổng buổi bắt buộc của môn) — `requiredDone` sau khi cộng đạt mốc này lần đầu ⇒ khoá luôn
   * `status COMPLETED` + `completedAt` (bỏ hoàn thành sau đó KHÔNG lùi lại trạng thái — Học lại là chuyện của buổi, không phải của cả lộ trình).
   */
  incrementCounts(id: string, delta: { completed: number; required: number }, lastLessonId: string, requiredLessonCount: number, tx?: TxHandle): Promise<void>;
  touchActivity(id: string, lastLessonId: string, tx?: TxHandle): Promise<void>;
}

export class PrismaRoadmapEnrollmentRepository implements IRoadmapEnrollmentRepository {
  async findById(id: string): Promise<RoadmapEnrollment | null> {
    const r = await prisma.roadmapEnrollment.findUnique({ where: { id } });
    return r ? toEnrollment(r) : null;
  }

  async findByUserAndSubject(userId: string, subjectId: string, tx?: TxHandle): Promise<RoadmapEnrollment | null> {
    const r = await (tx ?? prisma).roadmapEnrollment.findUnique({ where: { userId_subjectId: { userId, subjectId } } });
    return r ? toEnrollment(r) : null;
  }

  async listActiveByUser(userId: string): Promise<RoadmapEnrollment[]> {
    const rows = await prisma.roadmapEnrollment.findMany({ where: { userId, status: "ACTIVE" }, orderBy: { lastActivityAt: "desc" } });
    return rows.map(toEnrollment);
  }

  async listAllActive(): Promise<RoadmapEnrollment[]> {
    const rows = await prisma.roadmapEnrollment.findMany({ where: { status: "ACTIVE" } });
    return rows.map(toEnrollment);
  }

  async create(input: RoadmapEnrollmentCreateInput, tx?: TxHandle): Promise<RoadmapEnrollment> {
    const r = await (tx ?? prisma).roadmapEnrollment.create({
      data: {
        userId: input.userId,
        subjectId: input.subjectId,
        status: "ACTIVE",
        anchorDate: input.anchorDate,
        anchorNumber: input.anchorNumber,
        studyDays: input.studyDays,
        timezone: input.timezone,
        completedCount: 0,
        requiredDone: 0,
        lastLessonId: null,
        lastActivityAt: null,
        rescheduledAt: null,
        completedAt: null,
        version: 1,
      },
    });
    return toEnrollment(r);
  }

  async updateIf(id: string, expectedVersion: number, patch: RoadmapEnrollmentPatch, tx?: TxHandle): Promise<RoadmapEnrollment | null> {
    const db = tx ?? prisma;
    const data: Record<string, unknown> = { version: { increment: 1 } };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) data[k] = v;
    const result = await db.roadmapEnrollment.updateMany({ where: { id, version: expectedVersion }, data: data as Prisma.RoadmapEnrollmentUncheckedUpdateManyInput });
    return result.count === 0 ? null : this.findById(id);
  }

  async incrementCounts(id: string, delta: { completed: number; required: number }, lastLessonId: string, requiredLessonCount: number, tx?: TxHandle): Promise<void> {
    const db = tx ?? prisma;
    // Đọc trước để biết `requiredDone` SAU khi cộng có vừa cán mốc `requiredLessonCount` hay chưa — `$inc` không tự trả giá trị mới, và
    // không CAS ở đây (mẫu cũ) nên chấp nhận đọc-rồi-ghi thay vì aggregation pipeline update (Prisma+Mongo chưa hỗ trợ điều kiện trong `$inc`).
    const current = await db.roadmapEnrollment.findUnique({ where: { id }, select: { requiredDone: true, status: true } });
    const justCompleted = delta.required > 0 && current?.status !== "COMPLETED" && requiredLessonCount > 0 && (current?.requiredDone ?? 0) + delta.required >= requiredLessonCount;
    await db.roadmapEnrollment.updateMany({
      where: { id },
      data: {
        completedCount: { increment: delta.completed },
        requiredDone: { increment: delta.required },
        lastLessonId,
        lastActivityAt: new Date(),
        version: { increment: 1 },
        ...(justCompleted && { status: "COMPLETED", completedAt: new Date() }),
      },
    });
  }

  async touchActivity(id: string, lastLessonId: string, tx?: TxHandle): Promise<void> {
    const db = tx ?? prisma;
    await db.roadmapEnrollment.updateMany({ where: { id }, data: { lastLessonId, lastActivityAt: new Date(), version: { increment: 1 } } });
  }
}
