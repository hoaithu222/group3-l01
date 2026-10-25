/**
 * Hằng số cổng HR (p6-08). Giới hạn KHỚP `LIMITS.offer`/`LIMITS.talent`/`LIMITS.company` của BE (`be/src/core/constants/limits.ts`) và các DTO trong
 * `be/src/modules/recruiter/dtos/*.dto.ts` — đổi ở BE thì đối chiếu lại.
 */

/** Các tab của `/recruiter/portal` (khai `tabTitles` ở `recruiter-portal.routes.tsx`). */
export const PORTAL_TABS = ['talent', 'offers', 'company'] as const;
export type PortalTab = (typeof PORTAL_TABS)[number];

export const TALENT_PAGE_SIZE = 20;
export const OFFERS_PAGE_SIZE = 20;
export const MESSAGES_PAGE_SIZE = 30;

export const TALENT_LIMITS = {
  filterSkillsMax: 10,
  keywordMin: 2,
  keywordMax: 100,
  roleMax: 40,
  locationMax: 60,
  minBadgesMax: 50,
  /** Số chip kỹ năng hiện trên thẻ ứng viên (BE cũng cắt ở 6). */
  cardSkillsShown: 6,
} as const;

export const OFFER_LIMITS = {
  titleMin: 3,
  titleMax: 120,
  messageMin: 20,
  messageMax: 2000,
  locationMax: 60,
  threadMessageMax: 2000,
  /** JD PDF ≤ 5 MiB (`LIMITS.offer.jdMaxBytes`; kế hoạch ghi 10 MB nhưng BE đang là 5 MiB — bám mã). */
  jdMaxBytes: 5 * 1024 * 1024,
  /** Lời mời mở quá ngần này ngày tự hết hạn (chỉ để nói với HR). */
  expiresDays: 30,
} as const;

/** Debounce ô tìm từ khoá (admin.md §2.4 ghi 400 ms). */
export const TALENT_SEARCH_DEBOUNCE_MS = 400;

/** Khoá URL của bộ lọc ứng viên (đồng bộ URL, F5 giữ nguyên). */
export const TALENT_FILTER_KEYS = [
  'skills',
  'minContribution',
  'minBadges',
  'role',
  'location',
  'q',
] as const;

/** Khoá URL của ngăn kéo (mở trên nền danh sách, không đổi route). */
export const TALENT_DRAWER_PARAM = 'userId';
export const OFFER_DRAWER_PARAM = 'offerId';

/** Mã lỗi BE mà cổng phân biệt (`be/src/core/utils/error.codes.ts`). */
export const PORTAL_ERROR = {
  notApproved: 'RECR_002',
  ownerOnly: 'RECR_003',
  duplicateCompany: 'RECR_004',
  quotaExceeded: 'RECR_005',
  openOfferExists: 'RECR_006',
  cannotOffer: 'RECR_007',
  threadClosed: 'RECR_008',
  invalidState: 'RECR_009',
  viewLimit: 'RECR_010',
  memberElsewhere: 'RECR_011',
  lastOwner: 'RECR_012',
  alreadyInCompany: 'RECR_001',
  featureDisabled: 'CFG_005',
  notFound: 'RES_001',
  versionConflict: 'RES_003',
} as const;

/** Nhãn nhóm kỹ năng (khớp `SkillCategory` của BE; cùng nhãn với phân hệ `skill`). Mã lạ → hiện chính mã. */
export const SKILL_CATEGORY_LABEL: Readonly<Record<string, string>> = {
  FRONTEND: 'Frontend',
  BACKEND: 'Backend',
  MOBILE: 'Di động',
  DATA: 'Dữ liệu',
  DESIGN: 'Thiết kế',
  DEVOPS: 'DevOps',
  QA: 'Kiểm thử',
  SOFT: 'Kỹ năng mềm',
};

/** Đích cổng nhà tuyển dụng (viết thẳng path — không import `MODULE_PATHS`/registry vì trang đăng ký cũng nằm trong đồ thị mà registry lazy-load, dễ khép vòng `check:cycles`). Khớp `recruiter-portal.routes.tsx`. */
export const PORTAL_HOME_PATH = '/recruiter/portal';

/**
 * URL văn bản chính sách dữ liệu sinh viên. CHƯA có: văn bản `docs/policies/career-data.md` chờ chủ dự án duyệt (README p6-08 §7 "Pháp lý") trước khi bật ở môi trường có người dùng thật.
 * `null` = không vẽ liên kết (không bịa URL); điền URL thật khi có.
 */
export const CAREER_DATA_POLICY_URL: string | null = null;
