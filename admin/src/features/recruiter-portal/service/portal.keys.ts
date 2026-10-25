import type { OfferListParams } from '../types/offer.types';
import type { TalentSearchParams } from '../types/talent.types';

/**
 * Query key cổng HR (admin.md p6-08 §3) — cùng gốc `['portal']` để một lệnh làm mới cả công ty, ứng viên và lời mời. Khoá ứng viên/lời mời chứa `companyId`
 * nên đổi doanh nghiệp (hiếm) không lẫn cache; khoá `offer`/`messages` theo `offerId` để socket `offer:*` vá đúng một lời mời.
 */
export const portalKeys = {
  all: ['portal'] as const,
  me: () => ['portal', 'me'] as const,
  company: (companyId: string) => ['portal', 'company', companyId] as const,
  usage: (companyId: string) => ['portal', 'usage', companyId] as const,
  members: (companyId: string) => ['portal', 'members', companyId] as const,
  skills: () => ['portal', 'skills'] as const,
  /** Tiền tố — mọi bộ lọc của danh sách ứng viên (làm mới khi ứng viên biến mất). */
  talents: (companyId: string) => ['portal', 'talent', companyId] as const,
  talent: (companyId: string, filters: TalentSearchParams) =>
    ['portal', 'talent', companyId, filters] as const,
  profile: (companyId: string, userId: string) => ['portal', 'profile', companyId, userId] as const,
  proof: (companyId: string, userId: string, skillId: string) =>
    ['portal', 'proof', companyId, userId, skillId] as const,
  /** Tiền tố — mọi bộ lọc của danh sách lời mời. */
  offerLists: (companyId: string) => ['portal', 'offers', companyId] as const,
  offers: (companyId: string, params: OfferListParams) =>
    ['portal', 'offers', companyId, params] as const,
  offer: (offerId: string) => ['portal', 'offer', offerId] as const,
  messages: (offerId: string) => ['portal', 'messages', offerId] as const,
};
