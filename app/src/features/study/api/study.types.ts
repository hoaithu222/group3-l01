/**
 * DTO của p4-01 (bộ học · mục học · thẻ phổ biến · báo cáo) — VIẾT TAY vì công cụ sinh kiểu OpenAPI (p0-09) chưa
 * có; đã đối chiếu với BE thật (`be/src/modules/study/services/*presenter.ts`, `dtos/*`, be.md p4-01 §14).
 *
 * Ngày tháng là chuỗi ISO qua JSON (không phải `Date`).
 */

export const STUDY_VISIBILITIES = ['PRIVATE', 'WORKSPACE', 'PUBLIC'] as const;
export type StudyVisibility = (typeof STUDY_VISIBILITIES)[number];

/** `DELETED` không bao giờ tới client (BE trả 404). */
export type StudySetStatus = 'ACTIVE' | 'DELETED' | 'HIDDEN';

export const STUDY_ITEM_TYPES = [
  'FLASHCARD',
  'MULTIPLE_CHOICE',
  'MULTI_SELECT',
  'TRUE_FALSE',
  'FILL_BLANK',
] as const;
export type StudyItemType = (typeof STUDY_ITEM_TYPES)[number];

export const FILL_MATCH_MODES = ['EXACT', 'IGNORE_CASE', 'IGNORE_ACCENTS'] as const;
export type FillMatchMode = (typeof FILL_MATCH_MODES)[number];

export type StudyScope = 'mine' | 'public' | 'workspace';

export interface StudyUserRef {
  id: string;
  name: string;
}

export interface StudySetSummaryDto {
  id: string;
  ownerId: string;
  owner: StudyUserRef | null;
  workspaceId: string | null;
  title: string;
  description: string | null;
  tags: string[];
  coverAssetId: string | null;
  /** Thumbnail ký ≤ 60 s — `null` = chưa có ảnh/chưa xử lý xong. */
  coverThumbUrl: string | null;
  language: string | null;
  visibility: StudyVisibility;
  status: StudySetStatus;
  itemCount: number;
  /** Có ít nhất một câu chấm điểm được (thi thử p4-02 dùng được). */
  hasQuiz: boolean;
  copyCount: number;
  copiedFromId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudySetDto extends StudySetSummaryDto {
  itemTypesMask: number;
  /** Chỉ tác giả và OWNER/ADMIN nhóm thấy lý do ẩn. */
  hiddenReason: string | null;
  hiddenAt: string | null;
}

/** Quyền do SERVER tính (02-conventions §2) — client chỉ đọc, không suy từ vai trò. */
export interface StudySetMyPermissions {
  edit: boolean;
  delete: boolean;
  duplicate: boolean;
  report: boolean;
  hide: boolean;
  unhide: boolean;
}

export type StudySetDetailDto = StudySetDto & { myPermissions: StudySetMyPermissions };

export interface StudyOption {
  id: string;
  text: string;
  mediaAssetId: string | null;
}

/** Mục học KÈM đáp án — chỉ trả cho người đọc được nội dung bộ. */
export interface StudyItemDto {
  id: string;
  setId: string;
  type: StudyItemType;
  prompt: string;
  answerText: string | null;
  options: StudyOption[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  matchMode: FillMatchMode;
  explanation: string | null;
  frontMediaAssetId: string | null;
  backMediaAssetId: string | null;
  audioAssetId: string | null;
  tags: string[];
  order: number;
  version: number;
  updatedAt: string;
}

export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface StudySetPage {
  items: StudySetSummaryDto[];
  meta: CursorMeta;
}

/** `meta.setVersion` = version của BỘ tại lúc đọc — dùng làm `expectedVersion` của lần lưu đầu. */
export interface StudyItemsResult {
  items: StudyItemDto[];
  setVersion: number | null;
}

export interface ListSetsParams {
  scope: StudyScope;
  workspaceId?: string;
  q?: string;
  tag?: string;
}

export interface CreateSetPayload {
  title: string;
  description?: string;
  /** Asset ảnh bìa đã READY (scope `STUDY`, của chính người tạo) — BE `createSetSchema.coverAssetId`. */
  coverAssetId?: string;
  tags: string[];
  visibility: StudyVisibility;
  workspaceId?: string;
  confirmPublic?: boolean;
}

export interface PatchSetPayload {
  expectedVersion: number;
  title?: string;
  description?: string | null;
  /** `null` = gỡ ảnh bìa; thiếu = giữ nguyên (BE `patchSetSchema.coverAssetId` nullable). */
  coverAssetId?: string | null;
  tags?: string[];
  visibility?: StudyVisibility;
  workspaceId?: string;
  confirmPublic?: boolean;
}

export interface DuplicatePayload {
  targetVisibility?: 'PRIVATE' | 'WORKSPACE';
  workspaceId?: string;
}

export const REPORT_REASONS = [
  'SPAM',
  'COPYRIGHT',
  'INAPPROPRIATE',
  'WRONG_CONTENT',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface ReportPayload {
  reason: ReportReason;
  description?: string;
}

export interface ReportResult {
  id: string;
  status: string;
  createdAt: string;
  alreadyReported: boolean;
}

/**
 * Thân `POST /study-sets/:id/hide|unhide` (be `reasonSchema`): lý do BẮT BUỘC cho CẢ HAI chiều, đã `trim`, 10–500 ký tự.
 * Trả về `StudySetDetailDto` mới (kèm `myPermissions` tính lại theo trạng thái mới).
 */
export interface ModerationPayload {
  reason: string;
}

/** Hai chiều moderation bộ của nhóm: `hide` = ẩn (`myPermissions.hide`), `unhide` = khôi phục (`myPermissions.unhide`). */
export type ModerationKind = 'hide' | 'unhide';

export interface PopularTag {
  tag: string;
  count: number;
}

/** Phần `GET /workspaces/:id` mà Study cần — khai ĐỘC LẬP với feature `workspaces` (không import chéo). */
export interface WorkspaceAccess {
  id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  myRole: 'ADMIN' | 'GUEST' | 'MEMBER' | 'OWNER';
}

// ── PUT /study-sets/:id/items ────────────────────────────────────────────────

export interface ItemOptionInput {
  /** Có = giữ id lựa chọn cũ khi sửa mục (`o_` + 4–6 ký tự). */
  id?: string;
  text: string;
  mediaAssetId?: string | null;
}

interface ItemInputBase {
  /** Có = sửa mục đã có; thiếu = mục mới. */
  id?: string;
  clientItemKey: string;
  prompt: string;
  explanation?: string | null;
  frontMediaAssetId?: string | null;
  backMediaAssetId?: string | null;
  audioAssetId?: string | null;
  tags: string[];
  /** `null` = đầu danh sách; chuỗi = ngay SAU mục có `clientItemKey` đó. */
  afterClientItemKey?: string | null;
}

export type ItemInput =
  | (ItemInputBase & { type: 'FILL_BLANK'; acceptedAnswers: string[]; matchMode: FillMatchMode })
  | (ItemInputBase & { type: 'FLASHCARD'; answerText: string })
  | (ItemInputBase & {
      type: 'MULTI_SELECT';
      options: ItemOptionInput[];
      correctOptionIndexes: number[];
    })
  | (ItemInputBase & {
      type: 'MULTIPLE_CHOICE';
      options: ItemOptionInput[];
      correctOptionIndex: number;
    })
  | (ItemInputBase & { type: 'TRUE_FALSE'; correct: boolean });

export interface PutItemsPayload {
  expectedVersion: number;
  upsert: ItemInput[];
  delete: string[];
}

export interface PutItemsResult {
  version: number;
  itemCount: number;
  idMap: { clientItemKey: string; id: string }[];
}

/** Một dòng `details[]` của `400 STUDY_001` — `field` là đường dẫn (`options.2.mediaAssetId`). */
export interface BulkErrorDetail {
  index: number;
  clientItemKey?: string;
  field?: string;
  code: string;
  message?: string;
}
