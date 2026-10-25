import { prisma } from "../../../infrastructure/database";
import { DEFAULT_CAREER_VISIBILITY } from "../../career/public";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

/**
 * Ghi các trường "tìm việc" của `UserCareer` (openToWork, headline, preferredRoles, location, consentVersion, openToWorkChangedAt) — KHÔNG đụng `visibility`
 * (p6-06 sở hữu, `PUT /me/career/visibility`). Ngoại lệ có chủ đích: model `UserCareer` do `career` tạo nhưng `PUT /me/career` (be.md §4) thuộc recruiter vì phải
 * đồng bộ `TalentSearchIndex` NGUYÊN TỬ trong cùng transaction (tắt Open to work → biến mất khỏi tìm kiếm ngay, CR-06).
 */
export interface CareerSettingsPatch {
  openToWork: boolean;
  headline: string | null;
  preferredRoles: string[];
  location: string | null;
  /** `undefined` = giữ nguyên (khi tắt Open to work không cần đồng ý lại). */
  consentVersion?: string;
}

export interface CareerSettingsBefore {
  openToWork: boolean;
  consentVersion: string | null;
}

export interface ICareerSettingsRepository {
  /** Tạo bản ghi mặc định NGOÀI transaction nếu chưa có (đua tạo cùng lúc P2002 = đã có). */
  ensure(userId: string): Promise<void>;
  /** Trạng thái TRƯỚC khi ghi (để biết Open to work có đổi không). `null` khi chưa có bản ghi. */
  before(userId: string, tx?: TxHandle): Promise<CareerSettingsBefore | null>;
  apply(userId: string, patch: CareerSettingsPatch, now: Date, changedOpenToWork: boolean, tx?: TxHandle): Promise<void>;
  /** Người bật Open to work theo `userId` tăng dần sau `after` — đối soát hằng đêm. */
  listOpenToWork(after: string | null, limit: number): Promise<string[]>;
  /** Tập `userId` (trong `userIds`) đang bật Open to work — MỘT truy vấn cho cả lô (đối soát). */
  openToWorkAmong(userIds: readonly string[]): Promise<Set<string>>;
}

export class PrismaCareerSettingsRepository implements ICareerSettingsRepository {
  async ensure(userId: string): Promise<void> {
    const existing = await prisma.userCareer.findUnique({ where: { userId }, select: { id: true } });
    if (existing) return;
    try {
      await prisma.userCareer.create({
        data: { userId, openToWork: false, openToWorkChangedAt: null, headline: null, preferredRoles: [], location: null, consentVersion: null, visibility: { ...DEFAULT_CAREER_VISIBILITY } },
      });
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
    }
  }

  async before(userId: string, tx?: TxHandle): Promise<CareerSettingsBefore | null> {
    const r = await (tx ?? prisma).userCareer.findUnique({ where: { userId }, select: { openToWork: true, consentVersion: true } });
    return r ? { openToWork: r.openToWork, consentVersion: r.consentVersion ?? null } : null;
  }

  async apply(userId: string, patch: CareerSettingsPatch, now: Date, changedOpenToWork: boolean, tx?: TxHandle): Promise<void> {
    await (tx ?? prisma).userCareer.update({
      where: { userId },
      data: {
        openToWork: patch.openToWork,
        headline: patch.headline,
        preferredRoles: { set: patch.preferredRoles },
        location: patch.location,
        ...(patch.consentVersion !== undefined ? { consentVersion: patch.consentVersion } : {}),
        ...(changedOpenToWork ? { openToWorkChangedAt: now } : {}),
      },
    });
  }

  async listOpenToWork(after: string | null, limit: number): Promise<string[]> {
    const rows = await prisma.userCareer.findMany({ where: { openToWork: true, ...(after ? { userId: { gt: after } } : {}) }, orderBy: { userId: "asc" }, take: limit, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async openToWorkAmong(userIds: readonly string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await prisma.userCareer.findMany({ where: { userId: { in: [...userIds] }, openToWork: true }, select: { userId: true } });
    return new Set(rows.map((r) => r.userId));
  }
}
