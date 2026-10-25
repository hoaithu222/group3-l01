export const STUDY_VISIBILITIES = ["PRIVATE", "WORKSPACE", "PUBLIC"] as const;
export type StudyVisibilityValue = (typeof STUDY_VISIBILITIES)[number];

export const STUDY_SET_STATUSES = ["ACTIVE", "HIDDEN", "DELETED"] as const;
export type StudySetStatusValue = (typeof STUDY_SET_STATUSES)[number];

/** Entity domain — khớp model Prisma `StudySet`. */
export interface StudySet {
  id: string;
  ownerId: string;
  workspaceId: string | null;
  title: string;
  normalizedTitle: string;
  description: string | null;
  tags: string[];
  coverAssetId: string | null;
  language: string | null;
  visibility: StudyVisibilityValue;
  status: StudySetStatusValue;
  hiddenReason: string | null;
  hiddenBy: string | null;
  hiddenAt: Date | null;
  itemCount: number;
  itemTypesMask: number;
  reportedCount: number;
  copiedFromId: string | null;
  copyCount: number;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Tạo bộ mới — `id` sinh trước (gắn `AssetLink` ảnh bìa cùng transaction). */
export type StudySetCreateInput = Pick<
  StudySet,
  | "id"
  | "ownerId"
  | "workspaceId"
  | "title"
  | "normalizedTitle"
  | "description"
  | "tags"
  | "coverAssetId"
  | "language"
  | "visibility"
  | "itemCount"
  | "itemTypesMask"
  | "copiedFromId"
>;

/** Trường được phép sửa — chỉ ghi các khoá có mặt (`undefined` = giữ nguyên, `null` = xoá). */
export type StudySetPatch = Partial<
  Pick<
    StudySet,
    | "title"
    | "normalizedTitle"
    | "description"
    | "tags"
    | "coverAssetId"
    | "language"
    | "visibility"
    | "workspaceId"
    | "status"
    | "hiddenReason"
    | "hiddenBy"
    | "hiddenAt"
    | "deletedAt"
    | "itemCount"
    | "itemTypesMask"
  >
>;

/** Điều kiện ghi: `version` = CAS lạc quan; `statusIn` = chỉ ghi khi trạng thái hiện tại thuộc tập này. Luôn `version + 1`. */
export interface StudySetUpdateCondition {
  version?: number;
  statusIn?: readonly StudySetStatusValue[];
}

export type StudySetListScope = "mine" | "workspace" | "public";

export interface StudySetListParams {
  scope: StudySetListScope;
  viewerId: string;
  workspaceId?: string;
  /** Người xem là OWNER/ADMIN nhóm → thấy cả bộ WORKSPACE đã ẩn (để khôi phục). */
  includeHidden?: boolean;
  /** Các từ đã chuẩn hoá (AND trên `normalizedTitle`). */
  terms?: string[];
  tag?: string;
  hasQuiz?: boolean;
  after?: { at: Date; id: string };
  limit: number;
}

export interface PopularTag {
  tag: string;
  count: number;
}

/** Bộ PUBLIC cho tab `content` của admin (p4-01 admin.md §1): đã có ≥ `minReported` báo cáo mở, sắp `reportedCount desc, updatedAt desc`. */
export interface StudySetAdminListParams {
  minReported: number;
  /** Bỏ trống = cả `ACTIVE` lẫn `HIDDEN` (bộ đã xoá không bao giờ có mặt). */
  status?: "ACTIVE" | "HIDDEN";
  page: number;
  limit: number;
}

/** Chỉ SỐ LIỆU học tập của một người (admin.md §1 tab "Học tập" của user) — không tên bộ, không nội dung. `total` không tính bộ đã xoá. */
export interface StudyOwnerSummary {
  total: number;
  public: number;
  workspace: number;
  private: number;
  hidden: number;
}
