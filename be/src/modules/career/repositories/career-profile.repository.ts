import type { UserCareer as PrismaCareer } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { DEFAULT_CAREER_VISIBILITY, defaultCareer, type CareerVisibility, type UserCareer } from "../entities/career.interface";
import { isPrismaUniqueViolation } from "./tx";

/** Kho `UserCareer` (1-1 với `User`). Chưa có bản ghi ⇒ `find` trả `null`, service dùng `defaultCareer`. */
export interface ICareerProfileRepository {
  find(userId: string): Promise<UserCareer | null>;
  /** Nhiều người một lượt (lọc quyền xem huy hiệu/minh chứng). */
  findMany(userIds: readonly string[]): Promise<Map<string, UserCareer>>;
  upsertVisibility(userId: string, visibility: CareerVisibility): Promise<UserCareer>;
  deleteByUser(userId: string): Promise<number>;
}

const toCareer = (r: PrismaCareer): UserCareer => ({
  userId: r.userId,
  openToWork: r.openToWork,
  openToWorkChangedAt: r.openToWorkChangedAt ?? null,
  headline: r.headline ?? null,
  preferredRoles: r.preferredRoles,
  location: r.location ?? null,
  consentVersion: r.consentVersion ?? null,
  visibility: { ...DEFAULT_CAREER_VISIBILITY, ...r.visibility },
  updatedAt: r.updatedAt,
});

export class PrismaCareerProfileRepository implements ICareerProfileRepository {
  async find(userId: string): Promise<UserCareer | null> {
    const r = await prisma.userCareer.findUnique({ where: { userId } });
    return r ? toCareer(r) : null;
  }

  async findMany(userIds: readonly string[]): Promise<Map<string, UserCareer>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.userCareer.findMany({ where: { userId: { in: [...userIds] } } });
    return new Map(rows.map((r) => [r.userId, toCareer(r)]));
  }

  /** Tạo bản ghi đầu tiên NGOÀI transaction; đua tạo cùng lúc (P2002) → lượt sau cập nhật. */
  async upsertVisibility(userId: string, visibility: CareerVisibility): Promise<UserCareer> {
    const existing = await prisma.userCareer.findUnique({ where: { userId }, select: { id: true } });
    if (!existing) {
      try {
        const base = defaultCareer(userId);
        return toCareer(
          await prisma.userCareer.create({
            data: { userId, openToWork: base.openToWork, openToWorkChangedAt: null, headline: null, preferredRoles: [], location: null, consentVersion: null, visibility },
          })
        );
      } catch (err) {
        if (!isPrismaUniqueViolation(err)) throw err;
      }
    }
    return toCareer(await prisma.userCareer.update({ where: { userId }, data: { visibility: { set: visibility } } }));
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.userCareer.deleteMany({ where: { userId } })).count;
  }
}
