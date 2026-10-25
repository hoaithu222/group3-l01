import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";

export interface ProfileViewRow {
  companyId: string;
  dayKey: string;
  viewCount: number;
  lastViewedAt: Date;
}

/** Lượt xem hồ sơ gộp theo (công ty, sinh viên, ngày địa phương). */
export interface ITalentProfileViewRepository {
  /**
   * `$inc viewCount` + `$addToSet recruiterIds` + `$set lastViewedAt` bằng MỘT lệnh upsert nguyên tử (`$runCommandRaw update`) — hai HR xem cùng lúc không mất lượt.
   * Đua tạo hàng mới (E11000) → thử lại một lần (lần sau khớp hàng vừa tạo).
   */
  record(companyId: string, studentId: string, dayKey: string, recruiterId: string, at: Date): Promise<void>;
  listForStudent(studentId: string, before: { at: Date; id: string } | undefined, take: number): Promise<Array<ProfileViewRow & { id: string }>>;
  deleteByStudent(studentId: string): Promise<number>;
}

const oid = (id: string) => ({ $oid: id });

export class PrismaTalentProfileViewRepository implements ITalentProfileViewRepository {
  async record(companyId: string, studentId: string, dayKey: string, recruiterId: string, at: Date): Promise<void> {
    const command = {
      update: "TalentProfileView",
      updates: [
        {
          q: { companyId: oid(companyId), studentId: oid(studentId), dayKey },
          u: { $inc: { viewCount: 1 }, $addToSet: { recruiterIds: oid(recruiterId) }, $set: { lastViewedAt: { $date: at.toISOString() } } },
          upsert: true,
        },
      ],
    } as unknown as Prisma.InputJsonObject;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = (await prisma.$runCommandRaw(command)) as { writeErrors?: Array<{ code?: number }> };
      const dup = res.writeErrors?.some((e) => e.code === 11000);
      if (!res.writeErrors || res.writeErrors.length === 0) return;
      if (!dup || attempt === 1) throw new Error(`TalentProfileView upsert lỗi: ${JSON.stringify(res.writeErrors)}`);
    }
  }

  async listForStudent(studentId: string, before: { at: Date; id: string } | undefined, take: number): Promise<Array<ProfileViewRow & { id: string }>> {
    const rows = await prisma.talentProfileView.findMany({
      where: { studentId, ...(before ? { OR: [{ lastViewedAt: { lt: before.at } }, { lastViewedAt: before.at, id: { lt: before.id } }] } : {}) },
      orderBy: [{ lastViewedAt: "desc" }, { id: "desc" }],
      take,
    });
    return rows.map((r) => ({ id: r.id, companyId: r.companyId, dayKey: r.dayKey, viewCount: r.viewCount, lastViewedAt: r.lastViewedAt }));
  }

  async deleteByStudent(studentId: string): Promise<number> {
    return (await prisma.talentProfileView.deleteMany({ where: { studentId } })).count;
  }
}
