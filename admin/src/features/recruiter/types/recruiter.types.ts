/**
 * Kiểu phía VẬN HÀNH (`/admin/companies*`, `/admin/recruiter/stats`) — khớp `be/src/modules/recruiter/services/{company-admin,recruiter-stats}.service.ts`
 * và `dtos/admin.dto.ts`. Danh sách KHÔNG có logo/MST (BE chỉ trả các trường dưới đây); logo và MST nằm ở chi tiết.
 */
import type {
  CompanyMemberView,
  CompanyStatus,
  CompanyTier,
  CompanyView,
  OfferStatus,
} from './company.types';

/** Một dòng `GET /admin/companies` (phân trang `page/limit`). */
export interface AdminCompanyItem {
  id: string;
  name: string;
  website: string;
  status: CompanyStatus;
  tier: CompanyTier;
  createdAt: string;
  membersCount: number;
  /** Số lời mời đã gửi trong tháng hiện tại (đã dùng của hạn mức). */
  offersThisMonth: number;
  quota: number;
  /** Số báo cáo đang mở về doanh nghiệp này. */
  reportedCount: number;
}

export interface AdminCompaniesParams {
  page: number;
  limit: number;
  /** Tên (không dấu, khớp chứa) — lọc phía SERVER. */
  q?: string;
  status?: CompanyStatus;
  tier?: CompanyTier;
}

/** `GET /admin/companies/:id` — KHÔNG có nội dung/tiêu đề/người nhận lời mời (chỉ số đếm theo trạng thái). */
export interface AdminCompanyDetail {
  company: CompanyView;
  /** Tên miền của website (bỏ `www.`) — để đối chiếu email chủ sở hữu. */
  emailDomain: string | null;
  reportedCount: number;
  members: CompanyMemberView[];
  /** 6 kỳ gần nhất, mới → cũ. */
  usage: Array<{ period: string; used: number }>;
  quota: number;
  offersByStatus: Record<OfferStatus, number>;
}

/** Bốn hành động đổi trạng thái — mỗi hành động BẮT BUỘC `reason` 10–500 ký tự. */
export type CompanyAction = 'approve' | 'reject' | 'suspend' | 'reinstate';

export interface CompanyActionPayload {
  companyId: string;
  action: CompanyAction;
  reason: string;
}

/**
 * `PATCH /admin/companies/:id` (`recruiter:update`). `offerQuotaOverride: null` = bỏ ghi đè, theo gói; vắng = giữ nguyên.
 * `expectedVersion` lệch → `409 RES_003`.
 */
export interface CompanyPatchPayload {
  companyId: string;
  reason: string;
  expectedVersion: number;
  tier?: CompanyTier;
  offerQuotaOverride?: number | null;
  name?: string;
  website?: string;
  taxCode?: string | null;
}

/** `GET /admin/recruiter/stats` (`from ≤ to`, khoảng ≤ 366 ngày). */
export interface RecruiterStatsParams {
  from: string;
  to: string;
  tz: string;
}

export interface MonthlyOfferStats {
  period: string;
  sent: number;
  read: number;
  interested: number;
  declined: number;
  expired: number;
}

export interface RecruiterStats {
  byMonth: MonthlyOfferStats[];
  topCompanies: Array<{ companyId: string; name: string; sent: number }>;
  /** Doanh nghiệp đã dùng hết hạn mức tháng hiện tại. */
  companiesAtQuota: number;
  /** Ứng viên đang bật Open to work. */
  openToWorkCount: number;
}
