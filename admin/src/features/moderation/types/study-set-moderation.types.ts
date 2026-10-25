/**
 * Kiểu dữ liệu kiểm duyệt BỘ HỌC (p4-01 admin.md §3) — khớp DTO THẬT của BE:
 * `be/src/modules/study/services/study-set-moderation.service.ts` (`AdminStudySetDto`,
 * `AdminItemsPage`) và `services/study-set.presenter.ts` (`StudySetSummaryDto`, `StudyItemDto`).
 * Ngày giờ đi qua JSON là chuỗi ISO.
 *
 * Viết tay vì `openapi.json` chưa được sinh (p0-09); thay bằng kiểu sinh khi p0-09 xong.
 *
 * ⚠ Quyền riêng tư (admin-plan §3.4): NỘI DUNG mục học chỉ được lấy/hiển thị với bộ PUBLIC
 * (`canViewContent`). Bộ WORKSPACE chỉ có metadata; bộ PRIVATE/đã xoá BE trả 404.
 */

export type StudyVisibility = 'PRIVATE' | 'WORKSPACE' | 'PUBLIC';
export type StudySetStatus = 'ACTIVE' | 'HIDDEN' | 'DELETED';
export type StudyItemType =
  'FLASHCARD' | 'MULTIPLE_CHOICE' | 'MULTI_SELECT' | 'TRUE_FALSE' | 'FILL_BLANK';

/** `GET /admin/study-sets/:id` → `data`. */
export interface AdminStudySet {
  id: string;
  ownerId: string;
  owner: { id: string; name: string } | null;
  workspaceId: string | null;
  title: string;
  description: string | null;
  tags: string[];
  coverAssetId: string | null;
  /** Thumbnail ký ≤ 60 s của ảnh bìa; `null` = chưa có ảnh hoặc chưa xử lý xong. */
  coverThumbUrl: string | null;
  language: string | null;
  visibility: StudyVisibility;
  status: StudySetStatus;
  itemCount: number;
  hasQuiz: boolean;
  copyCount: number;
  copiedFromId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Bitmask loại mục (FLASHCARD 1 · MULTIPLE_CHOICE 2 · MULTI_SELECT 4 · TRUE_FALSE 8 · FILL_BLANK 16). */
  itemTypesMask: number;
  /** Số báo cáo ĐANG MỞ của bộ. */
  reportedCount: number;
  hiddenReason: string | null;
  hiddenBy: string | null;
  hiddenAt: string | null;
  /** `true` chỉ khi bộ PUBLIC — bộ WORKSPACE chỉ xem thông tin chung. */
  canViewContent: boolean;
}

export interface StudyItemOption {
  id: string;
  text: string;
  mediaAssetId: string | null;
  /** Thumbnail ký ≤ 60 s của ảnh lựa chọn; `null` = không có ảnh / chưa xử lý xong; vắng = BE cũ chưa trả. */
  mediaThumbUrl?: string | null;
}

/**
 * Một mục học kèm ĐÁP ÁN (`AdminStudyItemDto`) — CHỈ trả cho bộ PUBLIC. Ảnh: BE ký sẵn THUMBNAIL (≤ 60 s, không bản gốc) cho
 * mặt trước/sau và từng lựa chọn nên admin xem được ảnh; âm thanh chỉ có id (admin biết "có âm thanh", không nghe được).
 */
export interface AdminStudyItem {
  id: string;
  setId: string;
  type: StudyItemType;
  prompt: string;
  answerText: string | null;
  options: StudyItemOption[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  explanation: string | null;
  frontMediaAssetId: string | null;
  backMediaAssetId: string | null;
  /** Thumbnail ký ≤ 60 s của ảnh mặt trước/sau; `null` = không có ảnh / chưa xử lý xong; vắng = BE cũ chưa trả. */
  frontMediaThumbUrl?: string | null;
  backMediaThumbUrl?: string | null;
  audioAssetId: string | null;
  tags: string[];
  order: number;
  updatedAt: string;
}

export interface AdminStudyItemsParams {
  page: number;
  /** BE cho phép ≤ 50. */
  limit: number;
}

/** Ẩn/khôi phục — `reason` 10–500 ký tự (`reasonSchema` của BE). */
export interface StudySetDecisionPayload {
  setId: string;
  reason: string;
}

/** Trạng thái lọc của tab `content` — BE chỉ nhận `ACTIVE`|`HIDDEN` (`adminReportedSetsQuerySchema`); bỏ trống = cả hai. */
export type ReportedStudySetStatus = Exclude<StudySetStatus, 'DELETED'>;

/** `GET /admin/study-sets` (`adminReportedSetsQuerySchema`): `minReports` 1–1000, `limit` ≤ 50. Mỗi dòng là `AdminStudySet` (`AdminStudySetDto`). */
export interface AdminReportedStudySetsParams {
  page: number;
  limit: number;
  minReports: number;
  status?: ReportedStudySetStatus;
}

/** `GET /admin/users/:id/study-summary` → `data` (`AdminUserStudySummary`) — chỉ SỐ LIỆU, không tiêu đề/nội dung. `total` không tính bộ đã xoá. */
export interface AdminUserStudySummary {
  userId: string;
  total: number;
  public: number;
  workspace: number;
  private: number;
  hidden: number;
}
