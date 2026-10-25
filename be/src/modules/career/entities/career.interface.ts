/**
 * Hồ sơ nghề nghiệp dùng chung Phase 6 (p6-06 đặt nền; p6-07 portfolio, p6-08 recruiter board mở rộng). Lưu ở model `UserCareer`
 * (1-1 với `User`, KHÔNG phải field `User.career` như kế hoạch — tránh sửa model `User` của p0-01). Chưa có bản ghi ⇒ mặc định bên dưới.
 */
export interface CareerVisibility {
  /** Thành viên cùng nhóm xem được huy hiệu kỹ năng. */
  showSkills: boolean;
  /** Người ngoài nhóm của task thấy TIÊU ĐỀ task trong minh chứng. */
  proofTitles: boolean;
  showContribution: boolean;
  showQuiz: boolean;
  /** p6-07 — đồng ý hiện tên trong portfolio của đồng đội. */
  appearInOthersPortfolios: boolean;
}

export const DEFAULT_CAREER_VISIBILITY: CareerVisibility = {
  showSkills: true,
  proofTitles: false,
  showContribution: false,
  showQuiz: false,
  appearInOthersPortfolios: false,
};

export interface UserCareer {
  userId: string;
  openToWork: boolean;
  openToWorkChangedAt: Date | null;
  headline: string | null;
  preferredRoles: string[];
  location: string | null;
  consentVersion: string | null;
  visibility: CareerVisibility;
  updatedAt: Date | null;
}

export function defaultCareer(userId: string): UserCareer {
  return {
    userId,
    openToWork: false,
    openToWorkChangedAt: null,
    headline: null,
    preferredRoles: [],
    location: null,
    consentVersion: null,
    visibility: { ...DEFAULT_CAREER_VISIBILITY },
    updatedAt: null,
  };
}
