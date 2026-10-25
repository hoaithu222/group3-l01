import type { CareerVisibility } from "../entities/career.interface";
import type { ICareerProfileRepository } from "../repositories/career-profile.repository";
import type { SkillVisibilityService } from "./skill-visibility.service";

export interface CareerDto {
  openToWork: boolean;
  headline: string | null;
  preferredRoles: string[];
  location: string | null;
  visibility: CareerVisibility;
}

export type CareerVisibilityInput = Omit<CareerVisibility, "appearInOthersPortfolios"> & { appearInOthersPortfolios?: boolean };

/**
 * Hồ sơ nghề nghiệp của TÔI (`GET /me/career`, `PUT /me/career/visibility`). p6-06 chỉ ghi phần quyền riêng tư; Open to work / headline… do p6-08
 * bổ sung trên cùng model `UserCareer`. `appearInOthersPortfolios` (p6-07) vắng trong body ⇒ giữ nguyên giá trị đang lưu.
 */
export class CareerProfileService {
  constructor(
    private readonly careers: ICareerProfileRepository,
    private readonly visibility: SkillVisibilityService
  ) {}

  async get(userId: string): Promise<CareerDto> {
    return this.present(await this.visibility.career(userId));
  }

  async updateVisibility(userId: string, input: CareerVisibilityInput): Promise<CareerDto> {
    const cur = await this.visibility.career(userId);
    const next: CareerVisibility = { ...input, appearInOthersPortfolios: input.appearInOthersPortfolios ?? cur.visibility.appearInOthersPortfolios };
    return this.present(await this.careers.upsertVisibility(userId, next));
  }

  private present(c: { openToWork: boolean; headline: string | null; preferredRoles: string[]; location: string | null; visibility: CareerVisibility }): CareerDto {
    return { openToWork: c.openToWork, headline: c.headline, preferredRoles: [...c.preferredRoles], location: c.location, visibility: { ...c.visibility } };
  }
}
