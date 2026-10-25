/**
 * Kiểu tìm ứng viên (p6-08) — khớp `TalentCardView` ở `be/src/modules/recruiter/services/recruiter.presenter.ts` và `TalentProfileView` ở `services/talent-search.service.ts`.
 * BE KHÔNG bao giờ trả email/SĐT/tên nhóm; kiểu này cũng KHÔNG có các trường đó (xem `utils/talent-mapper.ts` — fixture có thêm `email` cũng bị bỏ khi ánh xạ).
 */
import type { OfferStatus } from '@/features/recruiter';

export interface TalentSkill {
  skillId: string;
  code: string;
  name: string;
  icon: string;
}

/** Thẻ ứng viên (kết quả tìm). `contributionPct*`/`portfolioUrl` VẮNG khi ứng viên tắt hoặc chưa đủ dữ liệu; `matchedSkills` chỉ khi có lọc kỹ năng. */
export interface TalentCard {
  userId: string;
  displayName: string;
  /**
   * URL TUYỆT ĐỐI ký sẵn của ảnh đại diện — dùng thẳng làm `src`, KHÔNG cần Bearer. Hết hạn sau 1–2 ngày (response mới
   * luôn kèm URL mới), đừng lưu lâu; ảnh lỗi/hết hạn thì `Avatar` lùi về chữ cái đầu.
   */
  avatarUrl: string | null;
  headline: string | null;
  preferredRoles: string[];
  location: string | null;
  skills: TalentSkill[];
  badgeCount: number;
  /** Phần trăm 0–100 (đã chia 10 ở BE). */
  contributionPct?: number;
  /** Số nhóm được tính vào điểm đóng góp. */
  contributionWorkspaces?: number;
  portfolioUrl?: string;
  matchedSkills?: number;
}

export interface TalentBadge {
  skillId: string;
  code: string;
  name: string;
  icon: string;
  category: string;
  unlockedAt: string;
  proof: { tasksDone: number; storyPoints: number; avgPeerScore: number | null };
}

/** `GET /companies/:id/talent/:userId` — mỗi lượt xem được ghi nhật ký (`talent.profile-view`). */
export interface TalentProfile {
  card: TalentCard;
  badges: TalentBadge[];
  /** Lời mời ĐANG MỞ của doanh nghiệp này với ứng viên (nếu có) — nút "Gửi lời mời" đổi thành "Xem lời mời". */
  openOffer: { id: string; status: OfferStatus; sentAt: string } | null;
}

/** `GET …/talent/:userId/skills/:skillId/proof` — tiêu đề task/tên nhóm CÓ THỂ null (ẩn trừ khi ứng viên bật `proofTitles`). */
export interface TalentProof {
  skill: { id: string; code: string; name: string; description: string | null; category: string; icon: string };
  unlockedAt: string;
  revoked: boolean;
  tasksDone: number;
  storyPoints: number;
  avgPeerScore: number | null;
  tasks: Array<{
    title: string | null;
    storyPoints: number;
    completedAt: string;
    reviewScore: number | null;
    workspaceName: string | null;
  }>;
  verifiedBy: 'SYSTEM';
}

/** Bộ lọc gửi lên `GET …/talent/search` (`talentSearchQuerySchema`). `skills` là danh sách MÃ kỹ năng (≤ 10). */
export interface TalentSearchParams {
  skills?: string[];
  minContribution?: number;
  minBadges?: number;
  role?: string;
  location?: string;
  q?: string;
  limit?: number;
}

/** Một mục danh mục kỹ năng cho ô lọc (rút gọn từ `GET /skills`). */
export interface SkillOption {
  code: string;
  name: string;
}
