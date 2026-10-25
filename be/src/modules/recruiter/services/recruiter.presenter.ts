import type { Company, CompanyMember, CompanyStatus, JobOffer, JobOfferMessage, RecruiterUser } from "../entities/recruiter.interface";
import { effectiveThreadLocked, isThreadOpen, type CompanyScopeAction } from "../domain/state-machines";
import type { TalentSearchRow } from "../repositories/talent-search-index.repository";
import { avatarUrlOf } from "../../../shared/media";

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
export const DELETED_ACCOUNT_NAME = "Tài khoản đã xoá";

export interface CompanyView {
  id: string;
  name: string;
  website: string;
  taxCode: string | null;
  description: string | null;
  logoUrl: string | null;
  industry: string | null;
  sizeRange: string | null;
  tier: string;
  status: CompanyStatus;
  /** Lý do duyệt/từ chối/tạm ngưng gần nhất — chỉ thành viên công ty thấy. */
  statusReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function presentCompany(c: Company, logoUrl: string | null): CompanyView {
  return {
    id: c.id,
    name: c.name,
    website: c.website,
    taxCode: c.taxCode,
    description: c.description,
    logoUrl,
    industry: c.industry,
    sizeRange: c.sizeRange,
    tier: c.tier,
    status: c.status,
    statusReason: c.statusReason,
    version: c.version,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Công ty nhìn từ SINH VIÊN (danh sách/chi tiết lời mời): chỉ tên, logo, trạng thái — không MST/mô tả nội bộ. */
export interface CompanyBrief {
  id: string;
  name: string;
  logoUrl: string | null;
  status: CompanyStatus;
}

export const presentCompanyBrief = (c: Pick<Company, "id" | "name" | "status">, logoUrl: string | null): CompanyBrief => ({ id: c.id, name: c.name, logoUrl, status: c.status });

export interface MembershipView {
  role: string;
  status: string;
  joinedAt: string;
}

export const presentMembership = (m: CompanyMember): MembershipView => ({ role: m.role, status: m.status, joinedAt: m.joinedAt.toISOString() });

export interface MemberView {
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
}

export function presentMember(m: CompanyMember, user: RecruiterUser | undefined): MemberView {
  return { userId: m.userId, name: user?.name ?? DELETED_ACCOUNT_NAME, email: user?.email ?? "", role: m.role, joinedAt: m.joinedAt.toISOString() };
}

export interface MyCompanyView {
  company: CompanyView;
  membership: MembershipView;
  permissions: CompanyScopeAction[];
}

/**
 * Sinh viên của lời mời (phía HR): tên hiển thị + ảnh; tài khoản đã ẩn danh hoá → "Tài khoản đã xoá", không ảnh.
 * `avatarUrl` = URL ảnh hiển thị TUYỆT ĐỐI ký sẵn (`avatarUrlOf`) — client dùng thẳng làm nguồn ảnh, không cần Bearer.
 */
export interface StudentBrief {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export function presentStudent(userId: string, user: RecruiterUser | undefined): StudentBrief {
  const gone = !user || user.status === "ANONYMIZED";
  return { userId, displayName: gone ? DELETED_ACCOUNT_NAME : user.name, avatarUrl: gone ? null : avatarUrlOf(user.avatarAssetId) };
}

export interface StudentOfferItem {
  id: string;
  company: CompanyBrief;
  title: string;
  employmentType: string;
  status: string;
  threadLocked: boolean;
  sentAt: string;
  readAt: string | null;
  expiresAt: string;
  unreadMessages: number;
}

export function presentStudentOfferItem(o: JobOffer, company: CompanyBrief, companyStatus: CompanyStatus): StudentOfferItem {
  return {
    id: o.id,
    company,
    title: o.title,
    employmentType: o.employmentType,
    status: o.status,
    threadLocked: effectiveThreadLocked(o, companyStatus),
    sentAt: o.sentAt.toISOString(),
    readAt: iso(o.readAt),
    expiresAt: o.expiresAt.toISOString(),
    unreadMessages: o.studentUnread,
  };
}

export interface StudentOfferDetail extends StudentOfferItem {
  message: string;
  location: string | null;
  recruiter: { name: string };
  jdUrl: string | null;
  sharedEmail: string | null;
  declineReason: string | null;
  respondedAt: string | null;
  threadOpen: boolean;
}

export function presentStudentOfferDetail(o: JobOffer, company: CompanyBrief, companyStatus: CompanyStatus, recruiterName: string, jdUrl: string | null): StudentOfferDetail {
  return {
    ...presentStudentOfferItem(o, company, companyStatus),
    message: o.message,
    location: o.location,
    recruiter: { name: recruiterName },
    jdUrl,
    sharedEmail: o.sharedEmail,
    declineReason: o.declineReason,
    respondedAt: iso(o.respondedAt),
    threadOpen: isThreadOpen(o, companyStatus),
  };
}

export interface CompanyOfferItem {
  id: string;
  student: StudentBrief;
  recruiter: { userId: string; name: string };
  title: string;
  employmentType: string;
  status: string;
  declineReason: string | null;
  threadLocked: boolean;
  sentAt: string;
  readAt: string | null;
  respondedAt: string | null;
  expiresAt: string;
  unreadMessages: number;
}

export function presentCompanyOfferItem(o: JobOffer, student: StudentBrief, recruiter: { userId: string; name: string }, companyStatus: CompanyStatus): CompanyOfferItem {
  return {
    id: o.id,
    student,
    recruiter,
    title: o.title,
    employmentType: o.employmentType,
    status: o.status,
    declineReason: o.declineReason,
    threadLocked: effectiveThreadLocked(o, companyStatus),
    sentAt: o.sentAt.toISOString(),
    readAt: iso(o.readAt),
    respondedAt: iso(o.respondedAt),
    expiresAt: o.expiresAt.toISOString(),
    unreadMessages: o.companyUnread,
  };
}

export interface CompanyOfferDetail extends CompanyOfferItem {
  message: string;
  location: string | null;
  jdUrl: string | null;
  /** Chỉ có khi sinh viên đã chọn chia sẻ email lúc Quan tâm. */
  sharedEmail: string | null;
  threadOpen: boolean;
}

export function presentCompanyOfferDetail(base: CompanyOfferItem, o: JobOffer, companyStatus: CompanyStatus, jdUrl: string | null): CompanyOfferDetail {
  return { ...base, message: o.message, location: o.location, jdUrl, sharedEmail: o.sharedEmail, threadOpen: isThreadOpen(o, companyStatus) };
}

export interface OfferMessageView {
  id: string;
  side: string;
  content: string;
  createdAt: string;
}

export const presentOfferMessage = (m: JobOfferMessage): OfferMessageView => ({ id: m.id, side: m.side, content: m.content, createdAt: m.createdAt.toISOString() });

/** Thẻ ứng viên (kết quả tìm) — KHÔNG email/SĐT/tên nhóm; `contributionPct*` VẮNG khi sinh viên tắt hoặc chưa đủ dữ liệu. */
export interface TalentCardView {
  userId: string;
  displayName: string;
  /** URL ảnh ký sẵn dựng từ `TalentSearchIndex.avatarAssetId` (đã có trong dòng kết quả — không truy vấn thêm); chưa có ảnh → `null`. */
  avatarUrl: string | null;
  headline: string | null;
  preferredRoles: string[];
  location: string | null;
  skills: Array<{ skillId: string; code: string; name: string; icon: string }>;
  badgeCount: number;
  contributionPct?: number;
  contributionWorkspaces?: number;
  portfolioUrl?: string;
  /** Số kỹ năng khớp bộ lọc (chỉ khi có lọc kỹ năng). */
  matchedSkills?: number;
}

export function presentTalentCard(r: TalentSearchRow, skillsMax: number, withMatch: boolean): TalentCardView {
  return {
    userId: r.userId,
    displayName: r.displayName,
    avatarUrl: avatarUrlOf(r.avatarAssetId),
    headline: r.headline,
    preferredRoles: r.preferredRoles,
    location: r.location,
    skills: r.skills.slice(0, skillsMax),
    badgeCount: r.badgeCount,
    ...(r.contributionPctX10 !== null ? { contributionPct: r.contributionPctX10 / 10 } : {}),
    ...(r.contributionPctX10 !== null && r.contributionWorkspaces !== null ? { contributionWorkspaces: r.contributionWorkspaces } : {}),
    ...(r.portfolioUrl ? { portfolioUrl: r.portfolioUrl } : {}),
    ...(withMatch ? { matchedSkills: r.matchScore } : {}),
  };
}
