/**
 * Public API của feature `recruiter` (vận hành p6-08) — CHỈ phần dùng chung với cổng HR (`recruiter-portal`) và khối báo cáo COMPANY của `moderation`:
 * kiểu hồ sơ doanh nghiệp, nhãn/hằng số, mảnh schema, huy hiệu trạng thái, hộp thoại hành động và hook đọc chi tiết. KHÔNG re-export trang/tab:
 * trang do registry nạp lười (`recruiter.routes.tsx`); riêng `RecruiterReportsTab` dùng `@/features/moderation` nên KHÔNG được xuất ở đây (tránh vòng
 * `recruiter` → `moderation` → `recruiter`).
 */
export { default as CompanyActionModal } from './components/CompanyActionModal';
export { default as CompanyStatusBadge } from './components/CompanyStatusBadge';
export { default as InfoRow } from './components/InfoRow';
export {
  COMPANY_ACTION_META,
  COMPANY_LIMITS,
  COMPANY_SIZE_LABEL,
  COMPANY_STATUS_META,
  COMPANY_TIER_LABEL,
  DECLINE_REASON_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  MEMBER_ROLE_LABEL,
  OFFER_STATUS_META,
  OFFER_STATUSES,
  REASON_LIMITS,
} from './constants/recruiter.constants';
export {
  companyNameField,
  descriptionField,
  industryField,
  taxCodeField,
  websiteField,
} from './schemas/company-fields';
export { recruiterKeys, useAdminCompany } from './service/recruiter.queries';
export type {
  CompanyMemberView,
  CompanySize,
  CompanyStatus,
  CompanyTier,
  CompanyUsage,
  CompanyView,
  DeclineReason,
  EmploymentType,
  MemberRole,
  OfferStatus,
} from './types/company.types';
export type { AdminCompanyDetail, CompanyAction } from './types/recruiter.types';
export { safeExternalUrl } from './utils/external-url';
export { isUnavailableError } from './utils/load-error';
