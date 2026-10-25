/**
 * Hình dạng dữ liệu dùng chung của `core/uploads/` — hợp đồng khớp
 * `be/src/modules/assets/{entities/asset.interface,dtos}.ts` (đọc TRỰC TIẾP từ
 * đó khi có nghi ngờ, KHÔNG suy diễn từ tài liệu `.md`).
 *
 * File `.types.ts` — miễn trần 150 dòng của `check-file-size.mjs` (dữ liệu,
 * không phải logic).
 */

/** Khớp `ASSET_SCOPES` (`be/.../entities/asset.interface.ts`). */
export const ASSET_SCOPES = [
  'MESSAGE',
  'RESOURCE',
  'AVATAR',
  'TASK',
  // p3-03: đính kèm BÌNH LUẬN của thẻ (khác `TASK` = đính kèm thẻ) — BE đã có, be/.../asset.interface.ts.
  'TASK_COMMENT',
  'DOC',
  'PRINT',
  'WORKSPACE',
  'MEETING',
  'RECORDING',
  // p4-01: ảnh/âm thanh của mục học + ảnh bìa bộ học — BE đã có, be/.../asset.interface.ts.
  'STUDY',
  // p4-07: ảnh bìa môn + ảnh admin tải cho buổi học (README §3 `AssetScope.ROADMAP`) — BE module `roadmap` đang
  // dựng song song (chưa chạy được lúc thêm dòng này), theo đúng be.md §1 `CLIENT_ASSET_SCOPES + ROADMAP`.
  'ROADMAP',
] as const;
export type AssetScope = (typeof ASSET_SCOPES)[number];

/** Khớp `ASSET_KINDS`. */
export const ASSET_KINDS = ['IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'FILE'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Khớp `ASSET_VARIANTS`. */
export const ASSET_VARIANTS = ['ORIGINAL', 'THUMB', 'POSTER'] as const;
export type AssetVariant = (typeof ASSET_VARIANTS)[number];

/** Khớp `ASSET_STATUSES`. */
export type AssetStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'REJECTED' | 'DELETED';

/**
 * Chỉ dẫn upload trả về từ `POST /assets` / `POST /assets/:id/upload-url` —
 * khớp NGUYÊN VĂN `UploadInstruction` của `storage.interface.ts` bên BE.
 */
export type UploadInstruction =
  | { method: 'PRESIGNED_PUT'; url: string; headers: Record<string, string>; expiresAt: string }
  | { method: 'API_PUT'; url: string };

/** Khớp `AssetDto` (`services/asset.service.ts`) — ngày tháng là chuỗi ISO qua JSON, không phải `Date`. */
export interface AssetDto {
  id: string;
  scope: AssetScope;
  kind: AssetKind;
  status: AssetStatus;
  mime: string;
  size: number | null;
  originalName: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: number[] | null;
  hasThumb: boolean;
  rejectReason: string | null;
  createdAt: string;
  readyAt: string | null;
}

/** Body `POST /assets` — khớp `createAssetSchema` (`dtos/create-asset.dto.ts`). */
export interface CreateAssetPayload {
  scope: AssetScope;
  kind: AssetKind;
  fileName: string;
  mime: string;
  size: number;
  checksum?: string;
  workspaceId?: string;
}

/** Body `POST /assets/:id/complete` — khớp `completeAssetSchema`. */
export interface CompleteAssetPayload {
  size: number;
  durationMs?: number;
  width?: number;
  height?: number;
  waveform?: number[];
}

/**
 * Trạng thái MỘT item trong hàng đợi (app.md §4) — riêng của app, KHÔNG khớp
 * `AssetStatus` của BE 1-1: `queued`/`creating`/`paused`/`cancelled` không tồn
 * tại phía BE, chúng mô tả tiến trình PHÍA CLIENT trước/song song với vòng đời
 * asset thật.
 */
export type UploadItemStatus =
  | 'queued'
  | 'creating'
  | 'uploading'
  | 'paused'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled';

/** Một mục trong `upload.store` — app.md §4. */
export interface UploadItem {
  localId: string;
  scope: AssetScope;
  kind: AssetKind;
  uri: string;
  name: string;
  mime: string;
  size: number;
  durationMs?: number;
  waveform?: number[];
  width?: number;
  height?: number;
  /** Gán sau khi `POST /assets` thành công — thiếu ⇒ chưa tạo asset lần nào. */
  assetId?: string;
  status: UploadItemStatus;
  /** 0..100. */
  progress: number;
  /** Mã lỗi (`ASSET_00x`) hoặc mã HTTP/axios khi `status === 'failed'`. */
  errorCode?: string;
  /**
   * Khoá phụ để lọc theo MỘT khung soạn tin/composer cụ thể khi nhiều khung
   * cùng `scope` (vd hai cuộc trò chuyện đều `MESSAGE`) — `useUpload(scope, scopeKey)`.
   */
  scopeKey?: string;
  /**
   * Workspace chứa đối tượng đích — gửi kèm `POST /assets` (`createAssetSchema.workspaceId`).
   * ⚠️ Scope `RESOURCE` (p3-01) CẦN nó: BE kiểm hạn mức dung lượng của workspace
   * TRƯỚC khi cấp URL upload (`413 RSC_007`), thiếu thì không có gì để so hạn mức.
   * Các scope khác (MESSAGE…) bỏ trống như cũ — pipeline không gửi trường này.
   */
  workspaceId?: string;
}

/** Kết quả một lượt chọn tệp (`core/media/pick-media.ts`) — đầu vào của `useUpload().enqueue()`. */
export interface PickedFile {
  uri: string;
  name: string;
  mime: string;
  size: number;
  kind: AssetKind;
  durationMs?: number;
  waveform?: number[];
  width?: number;
  height?: number;
}
