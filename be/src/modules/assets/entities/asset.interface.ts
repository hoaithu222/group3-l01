/** Scope client được phép tạo qua `POST /assets` (2 bước). */
export const CLIENT_ASSET_SCOPES = [
  "MESSAGE",
  "RESOURCE",
  "AVATAR",
  "TASK",
  "TASK_COMMENT",
  "DOC",
  "PRINT",
  "WORKSPACE",
  "MEETING",
  "RECORDING",
  "STUDY",
  /** (p6-05) Ảnh địa điểm O2O — gate của module `o2o` chỉ cho người có `o2o:update` tải lên. */
  "LOCATION",
  /** (p4-03) Ảnh huy hiệu gamification — gate của module `gamification` chỉ cho người có `gamification:update` tải lên. */
  "BADGE",
  /** (p6-08) Logo doanh nghiệp (ảnh) và JD PDF của lời mời — siết chặt ở `LIMITS.upload.scopeRestrict.COMPANY`; quyền đọc theo `AssetLink COMPANY_LOGO`/`JOB_OFFER` (resolver của module `recruiter`). */
  "COMPANY",
  /** (p6-02) Ảnh thu nhỏ bảng trắng do client chụp canvas — gate của module `whiteboards` chỉ cho thành viên nhóm tải lên; siết ở `LIMITS.upload.scopeRestrict.WHITEBOARD` (PNG/WebP ≤ 1 MiB). */
  "WHITEBOARD",
  /** (p4-07) Ảnh bìa môn học/ảnh buổi học và tài liệu PDF — gate của module `roadmap` chỉ cho người có `roadmap:update` tải lên. */
  "ROADMAP",
] as const;
export type ClientAssetScope = (typeof CLIENT_ASSET_SCOPES)[number];

/**
 * Scope CHỈ server tạo (`AssetService.createFromBuffer`, tệp do server sinh — vd PDF báo cáo đóng góp p4-06). `POST /assets` từ chối
 * (`createAssetSchema` chỉ nhận `CLIENT_ASSET_SCOPES`) nên client không thể tự đặt tệp vào các scope này.
 */
export const SERVER_ASSET_SCOPES = ["REPORT"] as const;
export type ServerAssetScope = (typeof SERVER_ASSET_SCOPES)[number];

export const ASSET_SCOPES = [...CLIENT_ASSET_SCOPES, ...SERVER_ASSET_SCOPES] as const;
export type AssetScope = (typeof ASSET_SCOPES)[number];

export const ASSET_STATUSES = ["UPLOADING", "PROCESSING", "READY", "REJECTED", "DELETED"] as const;
export type AssetStatusValue = (typeof ASSET_STATUSES)[number];

export const ASSET_KINDS = ["IMAGE", "VIDEO", "AUDIO", "VOICE", "FILE"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_VARIANTS = ["ORIGINAL", "THUMB", "POSTER"] as const;
export type AssetVariant = (typeof ASSET_VARIANTS)[number];

export const UPLOAD_METHODS = ["PRESIGNED_PUT", "API_PUT"] as const;
export type UploadMethod = (typeof UPLOAD_METHODS)[number];

export interface Asset {
  id: string;
  ownerId: string;
  workspaceId: string | null;
  scope: AssetScope;
  kind: AssetKind;
  variant: AssetVariant;
  parentAssetId: string | null;
  status: AssetStatusValue;
  uploadMethod: UploadMethod;
  mime: string;
  /** Kích thước client khai báo lúc tạo — trần trên, KHÔNG tin để hiển thị. */
  declaredSize: number;
  /** Kích thước thật xác nhận qua `storage.head()` — null cho tới khi `complete`. */
  size: number | null;
  originalName: string;
  storageKey: string;
  checksum: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** 64 điểm 0..100 — voice note, tính ở client, server chỉ kiểm độ dài. */
  waveform: number[] | null;
  thumbnailAssetId: string | null;
  rejectReason: string | null;
  createdAt: Date;
  processedAt: Date | null;
  readyAt: Date | null;
  deletedAt: Date | null;
  lastUnlinkedAt: Date | null;
}

export interface AssetCreateInput {
  /** Sinh trước bởi service (`newObjectId()`) — `storageKey` nhúng id này. */
  id: string;
  ownerId: string;
  scope: AssetScope;
  kind: AssetKind;
  workspaceId?: string;
  uploadMethod: UploadMethod;
  mime: string;
  declaredSize: number;
  originalName: string;
  storageKey: string;
  checksum?: string;
  status: AssetStatusValue;
  /** Asset con (thumbnail) — `variant`/`parentAssetId` khác `ORIGINAL`/null. */
  variant?: AssetVariant;
  parentAssetId?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface AssetUpdateInput {
  status?: AssetStatusValue;
  storageKey?: string;
  checksum?: string | null;
  rejectReason?: string | null;
  thumbnailAssetId?: string | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  waveform?: number[] | null;
  processedAt?: Date | null;
  readyAt?: Date | null;
  deletedAt?: Date | null;
  lastUnlinkedAt?: Date | null;
  /** Tương thích Phase 0 cũ — chỉ dùng bởi `scripts/migrate-asset-links.ts`. */
  attachedType?: string | null;
  attachedId?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AssetLink — p0-05 §2/§5.5
// ─────────────────────────────────────────────────────────────────────────────

export const ASSET_LINK_TARGETS = [
  "MESSAGE",
  "USER_AVATAR",
  "WORKSPACE_AVATAR",
  /** Ảnh bìa nhóm (targetId = workspaceId, scope WORKSPACE). */
  "WORKSPACE_COVER",
  "CONVERSATION_AVATAR",
  "MEETING_RECAP",
  "MEETING_RECORDING",
  "TASK",
  "TASK_COMMENT",
  "RESOURCE",
  "DOCUMENT",
  "EXPENSE_RECEIPT",
  "SETTLEMENT_PROOF",
  "STUDY_ITEM",
  "STUDY_SET_COVER",
  "CONTRIBUTION_EXPORT",
  /** (p6-05) Tệp in của đơn (resolver `o2o`) và ảnh địa điểm (scope USER — mọi người đăng nhập xem được). */
  "PRINT_ORDER",
  "LOCATION_PHOTO",
  /** (p4-03) Ảnh huy hiệu (`Badge.iconAssetId`) — quyền đọc do resolver của module `gamification` (mọi người đăng nhập khi huy hiệu còn tồn tại). */
  "BADGE_ICON",
  /** (đồng bộ chéo #3, Phase 7 — chưa có logic) Tệp của tin nhắn hẹn giờ (p7-04) và báo cáo quét trùng lặp (p7-05). */
  "SCHEDULED_MESSAGE",
  "PLAGIARISM_REPORT",
  /** (p6-07) Ảnh đại diện riêng của portfolio (targetId = portfolioId) và ảnh bìa dự án (targetId = portfolioProjectId) — link scope NONE (chỉ chủ đọc). */
  "PORTFOLIO",
  /** (p6-08) Logo doanh nghiệp (targetId = companyId) và JD PDF của lời mời (targetId = jobOfferId) — quyền đọc do resolver của module `recruiter`. */
  "COMPANY_LOGO",
  "JOB_OFFER",
  /** (p6-02) Ảnh thu nhỏ bảng trắng (targetId = whiteboardId, scope WORKSPACE) — quyền đọc do resolver của module `whiteboards` (`whiteboard.read`, PRIVATE không lộ ra cả nhóm). */
  "WHITEBOARD",
  /** (p4-07) Ảnh bìa môn học (targetId = subjectId) và ảnh/tệp buổi học (targetId = lessonId) — quyền đọc do resolver của module `roadmap` (môn/buổi đã xuất bản; admin luôn đọc được). */
  "ROADMAP_SUBJECT_COVER",
  "ROADMAP_LESSON",
  "OTHER",
] as const;
export type AssetLinkTargetType = (typeof ASSET_LINK_TARGETS)[number];

/**
 * Đích "ảnh hiển thị" — avatar người dùng/nhóm/nhóm chat và ảnh bìa nhóm. Asset gắn vào một trong các đích này:
 *  - được phục vụ qua URL ký không cần Bearer `GET /assets/:id/image` (`shared/media/display-image.ts`);
 *  - được cấp URL storage TTL dài `LIMITS.upload.avatarUrlTtlSeconds` thay vì ≤ 60 s của nội dung riêng tư.
 * ⛔ Chỉ thêm đích mà ảnh KHÔNG phải nội dung riêng tư (người có URL xem được tới khi URL hết hạn/ảnh bị gỡ).
 */
export const DISPLAY_IMAGE_TARGETS = [
  "USER_AVATAR",
  "WORKSPACE_AVATAR",
  "WORKSPACE_COVER",
  "CONVERSATION_AVATAR",
] as const satisfies readonly AssetLinkTargetType[];

export const ASSET_LINK_SCOPES = ["WORKSPACE", "CHANNEL", "CONVERSATION", "MEETING", "USER", "NONE"] as const;
export type AssetLinkScopeType = (typeof ASSET_LINK_SCOPES)[number];

export interface AssetLink {
  id: string;
  assetId: string;
  targetType: AssetLinkTargetType;
  targetId: string;
  scopeType: AssetLinkScopeType;
  scopeId: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface AssetLinkCreateInput {
  assetId: string;
  targetType: AssetLinkTargetType;
  targetId: string;
  scopeType: AssetLinkScopeType;
  scopeId?: string;
  createdBy: string;
}
