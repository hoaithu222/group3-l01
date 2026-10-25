/**
 * Kiểu cho báo cáo LỜI MỜI việc làm (`JOB_OFFER`, p6-08) trong kiểm duyệt — viết tay theo `ReportedOfferView` ở
 * `be/src/modules/recruiter/services/offer-moderation.service.ts` (`GET /admin/job-offers/:offerId/reported`).
 *
 * Vận hành CHỈ thấy nội dung lời mời khi lời mời đó đã có báo cáo (người báo cáo là chính người nhận, D-06): KHÔNG có thread trao đổi và KHÔNG có tên/email người nhận.
 * Báo cáo `COMPANY` dùng lại kiểu `AdminCompanyDetail` của `@/features/recruiter` (`GET /admin/companies/:id`), không khai lại ở đây.
 */
import type { EmploymentType, OfferStatus } from '@/features/recruiter';

export interface ReportedOffer {
  id: string;
  company: { id: string; name: string };
  title: string;
  message: string;
  employmentType: EmploymentType;
  location: string | null;
  status: OfferStatus;
  sentAt: string;
}

/** `POST /admin/job-offers/:offerId/withdraw` (`recruiter:approve`) — `reason` 10–500 ký tự. */
export interface OfferWithdrawPayload {
  offerId: string;
  reason: string;
}

export interface OfferWithdrawResult {
  id: string;
  status: OfferStatus;
}
