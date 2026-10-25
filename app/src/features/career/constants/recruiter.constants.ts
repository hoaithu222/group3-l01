import type {
  CompanyStatus,
  DeclineReason,
  EmploymentType,
  OfferStatus,
  ReportReason,
} from '../api/recruiter.types';

/** Giới hạn khớp `LIMITS.talent` của BE (p6-08 README §7) — không endpoint nào trả về nên đổi ở BE thì đổi ở đây. */
export const JOB_LIMITS = {
  headlineMax: 120,
  locationMax: 60,
  messageMax: 2000,
  preferredRoleMax: 40,
  preferredRoleMin: 2,
  preferredRolesMax: 5,
  reportOtherMin: 10,
} as const;

/**
 * Địa chỉ văn bản chính sách dữ liệu sinh viên đầy đủ (`docs/policies/career-data.md`). ⚠️ CHƯA có: văn bản chờ chủ dự án duyệt (README p6-08 §9 #9) và BE không trả
 * URL. Có địa chỉ thì điền vào đây — `CareerConsentSheet` tự hiện link "Đọc văn bản đầy đủ"; chưa có thì tấm chỉ có bốn ý tóm tắt (không link giả).
 */
export const CAREER_POLICY_URL = null as string | null;

/** Trạng thái lời mời luôn có CHỮ (không chỉ màu — app.md §7). Tên khớp `OfferStatusBadge` của kế hoạch. */
export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  DECLINED: 'Đã từ chối',
  EXPIRED: 'Hết hạn',
  INTERESTED: 'Quan tâm',
  READ: 'Đã xem',
  SENT: 'Mới',
  WITHDRAWN: 'Đã thu hồi',
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FREELANCE: 'Freelance',
  FULL_TIME: 'Toàn thời gian',
  INTERNSHIP: 'Thực tập',
  PART_TIME: 'Bán thời gian',
};

export const COMPANY_STATUS_LABEL: Record<CompanyStatus, string> = {
  APPROVED: 'Đã xác minh',
  PENDING: 'Chờ duyệt',
  REJECTED: 'Chưa được duyệt',
  SUSPENDED: 'Tạm ngưng',
};

/**
 * "Từ chối khéo" (app.md §7): doanh nghiệp CHỈ thấy mã lý do, không thấy câu nào khác — nên mỗi lý do kèm một dòng giải thích điều họ sẽ hiểu,
 * để người dùng chọn đúng mà không phải soạn lời từ chối.
 */
export const DECLINE_REASONS: readonly DeclineReason[] = [
  'NOT_LOOKING',
  'TIMING',
  'NOT_A_FIT',
  'LOCATION',
  'OTHER',
];

export const DECLINE_REASON_LABEL: Record<DeclineReason, string> = {
  LOCATION: 'Địa điểm chưa phù hợp',
  NOT_A_FIT: 'Vị trí chưa phù hợp với mình',
  NOT_LOOKING: 'Hiện mình chưa tìm việc',
  OTHER: 'Lý do khác',
  TIMING: 'Thời điểm chưa phù hợp',
};

export const DECLINE_REASON_HINT: Record<DeclineReason, string> = {
  LOCATION: 'Doanh nghiệp hiểu là nơi làm việc xa hoặc không tiện với bạn.',
  NOT_A_FIT: 'Doanh nghiệp hiểu là vị trí hoặc yêu cầu chưa khớp với định hướng của bạn.',
  NOT_LOOKING: 'Doanh nghiệp hiểu là bạn chưa có nhu cầu tìm việc lúc này.',
  OTHER: 'Doanh nghiệp chỉ biết bạn từ chối, không kèm lý do cụ thể.',
  TIMING: 'Doanh nghiệp hiểu là bạn bận (học tập, dự án) và chưa nhận thêm việc.',
};

/** Lý do báo cáo lời mời lạm dụng — cùng bộ với hộp báo cáo chung (p1-08, `POST /reports`). */
export const REPORT_REASONS: readonly ReportReason[] = [
  'SPAM',
  'SCAM',
  'INAPPROPRIATE',
  'HARASSMENT',
  'IMPERSONATION',
  'OTHER',
];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  HARASSMENT: 'Quấy rối',
  IMPERSONATION: 'Mạo danh doanh nghiệp',
  INAPPROPRIATE: 'Nội dung không phù hợp',
  OTHER: 'Lý do khác',
  SCAM: 'Lừa đảo',
  SPAM: 'Spam / quảng cáo',
};
