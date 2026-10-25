import type {
  StudyItemType,
  StudySetStatus,
  StudyVisibility,
} from '../types/study-set-moderation.types';

/** Số mục mỗi trang — trần của BE (`adminItemsQuerySchema.limit ≤ 50`). */
export const STUDY_ITEMS_PAGE_SIZE = 50;

/** URL thumbnail của mục do BE ký, sống ≤ 60 s — cache trang mục phải NGẮN hơn (xem `useAdminStudyItems`). */
export const STUDY_ITEMS_STALE_MS = 30_000;

/** Trang bảng mục trên URL — tiền tố riêng để không đụng `?page` của hàng đợi khi quay lại. */
export const STUDY_ITEMS_PAGE_PARAM = 'itemsPage';

/** Độ dài cắt của câu hỏi/mặt trước và đáp án trong bảng (admin.md p4-01 §2.1: 200 ký tự). */
export const STUDY_ITEM_PROMPT_MAX_CHARS = 200;

/** Mã lỗi BE mà giao diện phân biệt ở khối bộ học. */
export const STUDY_HIDDEN_CODE = 'STUDY_004';
export const STUDY_FEATURE_OFF_CODE = 'CFG_005';

export const STUDY_VISIBILITY_LABEL: Readonly<Record<StudyVisibility, string>> = {
  PRIVATE: 'Riêng tư',
  WORKSPACE: 'Trong nhóm',
  PUBLIC: 'Công khai',
};

export const STUDY_STATUS_META: Readonly<
  Record<StudySetStatus, { label: string; color: 'success' | 'warning' | 'neutral' }>
> = {
  ACTIVE: { label: 'Đang hiển thị', color: 'success' },
  HIDDEN: { label: 'Đã ẩn', color: 'warning' },
  DELETED: { label: 'Đã xoá', color: 'neutral' },
};

export const STUDY_ITEM_TYPE_LABEL: Readonly<Record<StudyItemType, string>> = {
  FLASHCARD: 'Thẻ ghi nhớ',
  MULTIPLE_CHOICE: 'Trắc nghiệm',
  MULTI_SELECT: 'Chọn nhiều đáp án',
  TRUE_FALSE: 'Đúng/Sai',
  FILL_BLANK: 'Điền chỗ trống',
};

/** Cờ `study` trong `capabilities.features` — tắt thì mọi route `/admin/study-sets*` trả `404 CFG_005`, nên tab `content` và tab "Học tập" của người dùng ẩn. */
export const STUDY_FEATURE_FLAG = 'study';

/** Tab `content` (admin.md p4-01 §1): số dòng mỗi trang (BE `limit ≤ 50`, mặc định 20). */
export const REPORTED_SETS_PAGE_SIZE = 20;

/** Ngưỡng mặc định của BE (`LIMITS.study.reportedPriorityThreshold`) — luôn gửi tường minh, URL bỏ khoá khi đúng giá trị này. */
export const DEFAULT_MIN_REPORTS = 5;
export const MIN_REPORTS_OPTIONS = [1, 3, 5, 10, 20] as const;

/** Khoá URL riêng của tab `content` — không đụng `status`/`page` của hàng đợi `reports` khi đổi tab. */
export const REPORTED_SETS_URL = {
  page: 'setsPage',
  pageSize: 'setsPageSize',
  status: 'setStatus',
  minReports: 'minReports',
  setId: 'setId',
} as const;
