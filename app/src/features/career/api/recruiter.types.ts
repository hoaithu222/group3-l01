import type { CareerVisibility } from './career.types';

/**
 * DTO của Recruiter board phía SINH VIÊN (p6-08) — khớp `be/src/modules/recruiter/services/recruiter.presenter.ts`
 * (`StudentOfferItem`/`StudentOfferDetail`/`OfferMessageView`), `career-settings.service.ts` (`CareerSettingsView`) và
 * `company-block.service.ts` (`BlockedCompanyView`). Ngày là chuỗi ISO qua JSON. Mã THẬT thắng tài liệu: `PUT /me/career`
 * và `GET /me/career/job-settings` là hợp đồng BE đang chạy (kế hoạch chỉ ghi `PUT`).
 */
export type OfferStatus = 'DECLINED' | 'EXPIRED' | 'INTERESTED' | 'READ' | 'SENT' | 'WITHDRAWN';

export type EmploymentType = 'FREELANCE' | 'FULL_TIME' | 'INTERNSHIP' | 'PART_TIME';

export type DeclineReason = 'LOCATION' | 'NOT_A_FIT' | 'NOT_LOOKING' | 'OTHER' | 'TIMING';

export type CompanyStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'SUSPENDED';

/** `COMPANY` = phía doanh nghiệp, `CANDIDATE` = phía sinh viên (tôi). */
export type OfferMessageSide = 'CANDIDATE' | 'COMPANY';

/** Công ty nhìn từ sinh viên: chỉ tên, logo, trạng thái — KHÔNG có website/quy mô (BE không trả). */
export interface CompanyBrief {
  id: string;
  logoUrl: string | null;
  name: string;
  status: CompanyStatus;
}

export interface OfferItem {
  company: CompanyBrief;
  employmentType: EmploymentType;
  expiresAt: string;
  id: string;
  readAt: string | null;
  sentAt: string;
  status: OfferStatus;
  /** Đã tính cả trường hợp công ty tạm ngưng (BE `effectiveThreadLocked`). */
  threadLocked: boolean;
  title: string;
  unreadMessages: number;
}

export interface OfferDetail extends OfferItem {
  declineReason: DeclineReason | null;
  /** URL ký, sống ~60 giây — ⛔ không giữ lâu, mở là gọi lại `GET` để lấy bản mới. */
  jdUrl: string | null;
  location: string | null;
  message: string;
  recruiter: { name: string };
  respondedAt: string | null;
  sharedEmail: string | null;
  /** = `INTERESTED` && chưa khoá && công ty còn `APPROVED`. */
  threadOpen: boolean;
}

export interface OfferMessage {
  content: string;
  createdAt: string;
  id: string;
  side: OfferMessageSide;
}

export interface SendMessagePayload {
  clientMessageId: string;
  content: string;
}

export interface BlockedCompany {
  blockedAt: string;
  company: CompanyBrief;
}

/**
 * Một dòng `GET /me/profile-views` — khớp `ProfileViewItem` của `be/src/modules/recruiter/services/company-block.service.ts`.
 * MỘT dòng = MỘT doanh nghiệp trong MỘT ngày (`dayKey` `"YYYY-MM-DD"`, múi giờ của BE); `viewCount` là số lượt xem trong ngày đó.
 * ⛔ Cố ý KHÔNG có danh tính nhà tuyển dụng — BE không trả (chỉ doanh nghiệp), đừng thêm trường suy đoán.
 */
export interface ProfileView {
  company: CompanyBrief;
  dayKey: string;
  lastViewedAt: string;
  viewCount: number;
}

export interface JobSettings {
  consentVersion: string | null;
  headline: string | null;
  location: string | null;
  openToWork: boolean;
  openToWorkChangedAt: string | null;
  preferredRoles: string[];
  /** Phiên bản chính sách dữ liệu HIỆN HÀNH — khác `consentVersion` ⇒ phải hỏi đồng ý lại trước khi bật. */
  requiredConsentVersion: string;
  /** Cờ `recruiter.enabled` (bảng tin nhà tuyển dụng) — tắt thì chỉ TẮT được Open to work. */
  recruiterEnabled: boolean;
  visibility: CareerVisibility;
}

/** `PUT /me/career` ghi ĐỦ hồ sơ tìm việc; `consentVersion` bắt buộc khi `openToWork = true`. */
export interface JobSettingsPayload {
  consentVersion?: string;
  headline: string | null;
  location: string | null;
  openToWork: boolean;
  preferredRoles: string[];
}

export type ReportReason =
  'HARASSMENT' | 'IMPERSONATION' | 'INAPPROPRIATE' | 'OTHER' | 'SCAM' | 'SPAM';

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Socket `offer:updated` (`user:{studentId}`) — payload v1, KHÔNG có tiêu đề/nội dung lời mời. */
export interface OfferUpdatedEvent {
  companyId: string;
  offerId: string;
  serverNow?: string;
  status: OfferStatus;
  threadLocked: boolean;
  v: number;
}

/** Socket `offer:message-created` — KHÔNG có nội dung tin (app gọi REST lấy lại). */
export interface OfferMessageCreatedEvent {
  createdAt: string;
  messageId: string;
  offerId: string;
  serverNow?: string;
  side: OfferMessageSide;
  v: number;
}

/** Socket `company:updated` — chỉ gửi cho nhân sự công ty (sinh viên thường không nhận), khai để hooking an toàn. */
export interface CompanyUpdatedEvent {
  companyId: string;
  serverNow?: string;
  status: CompanyStatus;
  tier: string;
  v: number;
}
