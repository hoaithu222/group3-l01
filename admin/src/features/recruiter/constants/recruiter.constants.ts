import type {
  CompanySize,
  CompanyStatus,
  CompanyTier,
  DeclineReason,
  EmploymentType,
  MemberRole,
  OfferStatus,
} from '../types/company.types';
import type { CompanyAction } from '../types/recruiter.types';

/** Màu `Badge` — khớp bộ giá trị của `BadgeColor` (không import từ `@/shared/ui` để constants không kéo UI vào). */
export type RecruiterBadgeColor = 'success' | 'warning' | 'error' | 'neutral' | 'info';

export interface StatusMeta {
  label: string;
  color: RecruiterBadgeColor;
}

/** Trạng thái doanh nghiệp — luôn hiện BẰNG CHỮ cạnh màu (không chỉ dựa vào màu). */
export const COMPANY_STATUS_META: Readonly<Record<CompanyStatus, StatusMeta>> = {
  PENDING: { label: 'Chờ duyệt', color: 'warning' },
  APPROVED: { label: 'Đã duyệt', color: 'success' },
  REJECTED: { label: 'Từ chối', color: 'error' },
  SUSPENDED: { label: 'Tạm ngưng', color: 'neutral' },
};

export const COMPANY_STATUSES = Object.keys(COMPANY_STATUS_META) as CompanyStatus[];

export const COMPANY_TIER_LABEL: Readonly<Record<CompanyTier, string>> = {
  FREE: 'Miễn phí',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};

export const COMPANY_TIERS = Object.keys(COMPANY_TIER_LABEL) as CompanyTier[];

export const COMPANY_SIZE_LABEL: Readonly<Record<CompanySize, string>> = {
  S1_10: '1–10 người',
  S11_50: '11–50 người',
  S51_200: '51–200 người',
  S201_1000: '201–1.000 người',
  S1000_PLUS: 'Trên 1.000 người',
};

export const MEMBER_ROLE_LABEL: Readonly<Record<MemberRole, string>> = {
  OWNER: 'Chủ sở hữu',
  RECRUITER: 'Nhà tuyển dụng',
};

export const OFFER_STATUS_META: Readonly<Record<OfferStatus, StatusMeta>> = {
  SENT: { label: 'Đã gửi', color: 'info' },
  READ: { label: 'Đã xem', color: 'info' },
  INTERESTED: { label: 'Quan tâm', color: 'success' },
  DECLINED: { label: 'Từ chối', color: 'neutral' },
  WITHDRAWN: { label: 'Đã thu hồi', color: 'neutral' },
  EXPIRED: { label: 'Hết hạn', color: 'warning' },
};

export const OFFER_STATUSES = Object.keys(OFFER_STATUS_META) as OfferStatus[];

export const EMPLOYMENT_TYPE_LABEL: Readonly<Record<EmploymentType, string>> = {
  INTERNSHIP: 'Thực tập',
  FULL_TIME: 'Toàn thời gian',
  PART_TIME: 'Bán thời gian',
  FREELANCE: 'Freelance',
};

/** Lý do từ chối dạng MÃ → chữ (HR chỉ thấy mã, không có lời nhắn tự do của sinh viên). */
export const DECLINE_REASON_LABEL: Readonly<Record<DeclineReason, string>> = {
  NOT_LOOKING: 'Chưa có nhu cầu tìm việc',
  NOT_A_FIT: 'Vị trí chưa phù hợp',
  LOCATION: 'Địa điểm chưa phù hợp',
  TIMING: 'Chưa đúng thời điểm',
  OTHER: 'Lý do khác',
};

/** Giới hạn khớp `LIMITS.company` của BE (`be/src/core/constants/limits.ts`) — đổi ở BE thì đối chiếu lại. */
export const COMPANY_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  websiteMax: 200,
  descriptionMax: 2000,
  industryMax: 60,
  membersMax: 20,
  /** Ảnh logo scope `COMPANY`: JPEG/PNG/WebP ≤ 2 MiB. */
  logoMaxBytes: 2 * 1024 * 1024,
} as const;

/** `reasonSchema` của BE: 10–500 ký tự (`ConfirmWithReasonModal` đã áp mặc định). */
export const REASON_LIMITS = { min: 10, max: 500 } as const;

/** `offerQuotaOverride` 0–10.000 (`adminCompanyPatchSchema`). */
export const QUOTA_OVERRIDE_MAX = 10_000;

/** `?status=all` = bỏ lọc; vắng = mặc định thông minh (Chờ duyệt nếu đang có). */
export const STATUS_FILTER_ALL = 'all';
export const COMPANIES_PAGE_SIZE = 20;

/** Mã BE mà giao diện phân biệt (`be/src/core/utils/error.codes.ts`). */
export const RECRUITER_ERROR = {
  invalidState: 'RECR_009',
  versionConflict: 'RES_003',
} as const;

export interface CompanyActionMeta {
  label: string;
  confirmLabel: string;
  impact: string;
  danger: boolean;
}

/** Nhãn + tác động của bốn hành động — hiện trong hộp thoại lý do (`ConfirmWithReasonModal`). */
export const COMPANY_ACTION_META: Readonly<Record<CompanyAction, CompanyActionMeta>> = {
  approve: {
    label: 'Duyệt',
    confirmLabel: 'Duyệt doanh nghiệp',
    impact:
      'Doanh nghiệp được tìm ứng viên và gửi lời mời; chủ sở hữu nhận thông báo. Hành động này ghi nhật ký quản trị.',
    danger: false,
  },
  reject: {
    label: 'Từ chối',
    confirmLabel: 'Từ chối doanh nghiệp',
    impact:
      'Lý do bên dưới được gửi cho doanh nghiệp; họ có thể sửa hồ sơ và gửi duyệt lại. Tên và mã số thuế được nhả để đăng ký lại.',
    danger: true,
  },
  suspend: {
    label: 'Tạm ngưng',
    confirmLabel: 'Tạm ngưng doanh nghiệp',
    impact:
      'HR mất quyền tìm ứng viên và gửi lời mời NGAY; mọi lời mời đang mở (đã gửi, đã xem, quan tâm) bị khoá trao đổi và chỉ còn đọc. Báo cáo đang mở về doanh nghiệp được đóng.',
    danger: true,
  },
  reinstate: {
    label: 'Khôi phục',
    confirmLabel: 'Khôi phục doanh nghiệp',
    impact: 'Doanh nghiệp hoạt động trở lại; trao đổi của các lời mời đang mở được mở lại.',
    danger: false,
  },
};

/** Toast thành công theo hành động. */
export const COMPANY_ACTION_DONE: Readonly<Record<CompanyAction, string>> = {
  approve: 'Đã duyệt doanh nghiệp và ghi nhật ký',
  reject: 'Đã từ chối doanh nghiệp, lý do được gửi cho chủ sở hữu',
  suspend: 'Đã tạm ngưng doanh nghiệp và ghi nhật ký',
  reinstate: 'Đã khôi phục doanh nghiệp và ghi nhật ký',
};

/** Hành động hợp lệ theo trạng thái hiện tại — khớp máy trạng thái của BE (`domain/state-machines.ts`). */
export const ACTIONS_BY_STATUS: Readonly<Record<CompanyStatus, readonly CompanyAction[]>> = {
  PENDING: ['approve', 'reject'],
  APPROVED: ['suspend'],
  REJECTED: [],
  SUSPENDED: ['reinstate'],
};
