/**
 * Hình dạng dữ liệu của luồng tải lên `/assets` — khớp
 * `be/src/modules/assets/{entities/asset.interface,dtos,services/asset.service}.ts`
 * (đọc TRỰC TIẾP từ code BE, không suy từ tài liệu `.md`).
 */

/** Khớp `ASSET_SCOPES` phía BE. */
export type AssetScope =
  | 'MESSAGE'
  | 'RESOURCE'
  | 'AVATAR'
  | 'TASK'
  | 'DOC'
  | 'PRINT'
  | 'WORKSPACE'
  | 'MEETING'
  | 'RECORDING'
  /** Ảnh huy hiệu gamification (p4-03) — BE chỉ cho người có `gamification:update` tải lên; PNG/WebP ≤ 512 KiB. */
  | 'BADGE'
  /** Ảnh địa điểm O2O (p6-05) — BE chỉ cho người có `o2o:update` tải lên; tối đa `O2O_LIMITS.photosMax` ảnh/địa điểm. */
  | 'LOCATION'
  /** Logo doanh nghiệp (ảnh JPEG/PNG/WebP ≤ 2 MiB) và JD đính kèm lời mời (PDF ≤ 5 MiB) của Recruiter board (p6-08); KHÔNG SVG. */
  | 'COMPANY'
  /**
   * Ảnh bìa môn + ảnh buổi học của Lộ trình học (p4-07) — BE chỉ cho người có `roadmap:update` tải lên;
   * `IMAGE` JPEG/PNG/WebP ≤ 5 MiB, `FILE` PDF ≤ 20 MiB (be.md §9 `upload.scopeRestrict.ROADMAP`). SVG
   * của buổi KHÔNG đi qua `/assets` — gửi thẳng chuỗi SVG trong `POST .../lessons/:id/media`.
   */
  | 'ROADMAP';

/** Khớp `ASSET_KINDS`. */
export type AssetKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'FILE';

export type AssetStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'REJECTED' | 'DELETED';

/** Khớp `UploadInstruction` của `storage.interface.ts` — S3 trả `PRESIGNED_PUT`, Local/Cloudinary trả `API_PUT`. */
export type PresignedPutInstruction = {
  method: 'PRESIGNED_PUT';
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
};
export type UploadInstruction = PresignedPutInstruction | { method: 'API_PUT'; url: string };

/** Khớp `AssetDto` — ngày tháng là chuỗi ISO qua JSON. */
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

/** Body `POST /assets` — khớp `createAssetSchema`. */
export interface CreateAssetPayload {
  scope: AssetScope;
  kind: AssetKind;
  fileName: string;
  mime: string;
  size: number;
  workspaceId?: string;
}

export interface UploadAssetOptions {
  scope: AssetScope;
  /** Bỏ trống → suy từ MIME (`assetKindFromMime`); `VOICE` phải khai tường minh. */
  kind?: AssetKind;
  workspaceId?: string;
  /** Tiến độ 0–100 cho CẢ luồng (tải nội dung chiếm phần lớn, phần cuối là chốt + chờ xử lý). */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  /** Báo id asset ngay khi BE đã đăng ký (trước khi tải xong) — hàng đợi ghi vào `UploadFile.assetId`. */
  onAssetId?: (assetId: string) => void;
  /** `Idempotency-Key` của `POST /assets` — bỏ trống thì tự sinh (8–128 ký tự, BE bắt buộc header này). */
  idempotencyKey?: string;
  /** Thời gian chờ `PROCESSING` → `READY`. Mặc định 30 s (be.md §3 "poll tối đa 30 s"). */
  pollTimeoutMs?: number;
  /** Bậc backoff giữa các lần poll, lặp lại bậc cuối. Mặc định 0,5 → 1 → 2 → 3 s. */
  pollBackoffMs?: readonly number[];
  /** Chỉ để test — mặc định `new XMLHttpRequest()`. */
  createXhr?: () => XMLHttpRequest;
}

/** Lỗi luồng tải lên KHÔNG đến từ HTTP của apiClient (đã có toast riêng): tệp bị từ chối, hết giờ chờ, PUT lỗi. */
export class AssetUploadError extends Error {
  readonly code: string;
  /** HTTP status của bước PUT tới storage (nếu có) — `403` nghĩa là URL ký hết hạn. */
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'AssetUploadError';
    this.code = code;
    this.status = status;
  }
}
