/**
 * Thực thể miền của `recruiter` (p6-08). Kiểu enum khớp enum Prisma (chuỗi) nhưng khai riêng để service/domain KHÔNG import `@prisma/client`.
 * Ngày là `Date` ở thực thể; DTO trả client là ISO string (xem `services/recruiter.presenter.ts`).
 */
export const COMPANY_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const COMPANY_TIERS = ["FREE", "PRO", "ENTERPRISE"] as const;
export type CompanyTier = (typeof COMPANY_TIERS)[number];

export const COMPANY_SIZES = ["S1_10", "S11_50", "S51_200", "S201_1000", "S1000_PLUS"] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export const MEMBER_ROLES = ["OWNER", "RECRUITER"] as const;
export type CompanyMemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_STATUSES = ["ACTIVE", "REMOVED"] as const;
export type CompanyMemberStatus = (typeof MEMBER_STATUSES)[number];

export const OFFER_STATUSES = ["SENT", "READ", "INTERESTED", "DECLINED", "WITHDRAWN", "EXPIRED"] as const;
export type JobOfferStatus = (typeof OFFER_STATUSES)[number];
/** Lời mời còn "mở" — giữ `activeKey` (mỗi cặp công ty/sinh viên ≤ 1). */
export const OPEN_OFFER_STATUSES: readonly JobOfferStatus[] = ["SENT", "READ", "INTERESTED"];

export const EMPLOYMENT_TYPES = ["INTERNSHIP", "FULL_TIME", "PART_TIME", "FREELANCE"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const DECLINE_REASONS = ["NOT_LOOKING", "NOT_A_FIT", "LOCATION", "TIMING", "OTHER"] as const;
export type OfferDeclineReason = (typeof DECLINE_REASONS)[number];

export const MESSAGE_SIDES = ["COMPANY", "CANDIDATE"] as const;
export type OfferMessageSide = (typeof MESSAGE_SIDES)[number];

export interface Company {
  id: string;
  name: string;
  normalizedName: string;
  nameKey: string;
  taxCode: string | null;
  taxCodeKey: string;
  website: string;
  emailDomain: string | null;
  description: string | null;
  logoAssetId: string | null;
  industry: string | null;
  sizeRange: CompanySize | null;
  tier: CompanyTier;
  offerQuotaOverride: number | null;
  status: CompanyStatus;
  statusReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reportedCount: number;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  role: CompanyMemberRole;
  status: CompanyMemberStatus;
  activeKey: string;
  invitedBy: string | null;
  joinedAt: Date;
  removedAt: Date | null;
}

export interface JobOffer {
  id: string;
  companyId: string;
  recruiterId: string;
  studentId: string;
  title: string;
  message: string;
  employmentType: EmploymentType;
  location: string | null;
  jdAssetId: string | null;
  status: JobOfferStatus;
  activeKey: string;
  clientRequestId: string;
  sharedEmail: string | null;
  declineReason: OfferDeclineReason | null;
  threadLocked: boolean;
  studentUnread: number;
  companyUnread: number;
  reportedCount: number;
  sentAt: Date;
  readAt: Date | null;
  respondedAt: Date | null;
  withdrawnAt: Date | null;
  expiresAt: Date;
  lastMessageAt: Date | null;
  version: number;
}

export interface JobOfferMessage {
  id: string;
  offerId: string;
  authorId: string;
  side: OfferMessageSide;
  content: string;
  clientMessageId: string;
  createdAt: Date;
}

export interface TalentSkillRef {
  skillId: string;
  code: string;
  name: string;
  icon: string;
}

/** Bản chiếu tìm kiếm của ứng viên — ĐÃ lọc quyền riêng tư lúc dựng (xem `domain/talent-index.builder.ts`). */
export interface TalentIndexDoc {
  userId: string;
  openToWork: boolean;
  displayName: string;
  normalizedText: string;
  avatarAssetId: string | null;
  headline: string | null;
  preferredRoles: string[];
  preferredRolesKey: string[];
  location: string | null;
  locationKey: string | null;
  skillCodes: string[];
  skills: TalentSkillRef[];
  badgeCount: number;
  contributionPctX10: number | null;
  contributionWorkspaces: number | null;
  portfolioUrl: string | null;
  blockedCompanyIds: string[];
  sourceUpdatedAt: Date;
  rebuiltAt: Date;
}

export interface TalentProfileView {
  companyId: string;
  studentId: string;
  dayKey: string;
  viewCount: number;
  recruiterIds: string[];
  lastViewedAt: Date;
}

export interface CompanyBlock {
  userId: string;
  companyId: string;
  createdAt: Date;
}

/** Hồ sơ người dùng tối thiểu recruiter cần đọc (không email trừ khi chính lời mời/thành viên cần). */
export interface RecruiterUser {
  id: string;
  name: string;
  email: string;
  status: string;
  role: string;
  avatarAssetId: string | null;
}
