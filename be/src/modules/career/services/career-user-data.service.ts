import type { ICareerProfileRepository } from "../repositories/career-profile.repository";
import type { ISkillBadgeRepository } from "../repositories/skill-badge.repository.interface";
import type { ISkillCreditRepository, IUserSkillProgressRepository } from "../repositories/skill-ledger.repository.interface";

/**
 * Xoá dữ liệu nghề nghiệp CÁ NHÂN khi tài khoản bị ẩn danh hoá (job `gamification/career.user-anonymized`, idempotent). Producer: `UserAnonymizer`
 * (module `users`) ghi MỘT dòng outbox riêng `career.user-anonymized:user:<id>` cùng transaction (như `gamification.user-anonymized`).
 */
export class CareerUserDataService {
  constructor(
    private readonly d: { credits: ISkillCreditRepository; progress: IUserSkillProgressRepository; badges: ISkillBadgeRepository; careers: ICareerProfileRepository }
  ) {}

  async erase(userId: string): Promise<{ credits: number; progress: number; badges: number; career: number }> {
    const [credits, progress, badges, career] = await Promise.all([
      this.d.credits.deleteByUser(userId),
      this.d.progress.deleteByUser(userId),
      this.d.badges.deleteByUser(userId),
      this.d.careers.deleteByUser(userId),
    ]);
    return { credits, progress, badges, career };
  }
}
