import { prisma } from "../../../infrastructure/database";
import type { SrEnrollment } from "../entities/sr.interface";
import { isPrismaUniqueViolation } from "./errors";
import type { ISrEnrollmentRepository } from "./sr-enrollment.repository.interface";

type SrEnrollmentRecord = Awaited<ReturnType<typeof prisma.srEnrollment.findFirstOrThrow>>;

function toEnrollment(r: SrEnrollmentRecord): SrEnrollment {
  return {
    id: r.id,
    userId: r.userId,
    setId: r.setId,
    active: r.active,
    newPerDay: r.newPerDay,
    syncedVersion: r.syncedVersion,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaSrEnrollmentRepository implements ISrEnrollmentRepository {
  async upsert(userId: string, setId: string, opts: { newPerDay?: number; defaultNewPerDay: number }): Promise<SrEnrollment> {
    const update = { active: true, ...(opts.newPerDay !== undefined && { newPerDay: opts.newPerDay }) };
    const updated = await prisma.srEnrollment.updateMany({ where: { userId, setId }, data: update });
    if (updated.count === 0) {
      try {
        await prisma.srEnrollment.create({ data: { userId, setId, active: true, newPerDay: opts.newPerDay ?? opts.defaultNewPerDay, syncedVersion: 0 } });
      } catch (err) {
        if (!isPrismaUniqueViolation(err)) throw err;
        // Đua tạo cùng `(userId, setId)` — NGOÀI transaction nên bắt được: cập nhật hàng của bên thắng.
        await prisma.srEnrollment.updateMany({ where: { userId, setId }, data: update });
      }
    }
    return toEnrollment(await prisma.srEnrollment.findUniqueOrThrow({ where: { userId_setId: { userId, setId } } }));
  }

  async find(userId: string, setId: string): Promise<SrEnrollment | null> {
    const r = await prisma.srEnrollment.findUnique({ where: { userId_setId: { userId, setId } } });
    return r ? toEnrollment(r) : null;
  }

  async listActive(userId: string, setIds?: readonly string[]): Promise<SrEnrollment[]> {
    const rows = await prisma.srEnrollment.findMany({ where: { userId, active: true, ...(setIds && { setId: { in: [...setIds] } }) } });
    return rows.map(toEnrollment);
  }

  async deactivate(userId: string, setId: string): Promise<boolean> {
    return (await prisma.srEnrollment.updateMany({ where: { userId, setId }, data: { active: false } })).count > 0;
  }

  async markSynced(id: string, setVersion: number): Promise<void> {
    await prisma.srEnrollment.updateMany({ where: { id }, data: { syncedVersion: setVersion } });
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.srEnrollment.deleteMany({ where: { userId } })).count;
  }
}
