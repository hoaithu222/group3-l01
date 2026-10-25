/**
 * Upload types — shared shape cho Upload, FileCard, FileList, useUpload.
 *
 * `UploadFile` là entity duy nhất xuyên suốt hệ thống upload. Mỗi file giữ
 * `id` (UUID nội bộ) + `status` để FileCard biết render variant + actions
 * tương ứng. `progress` chỉ có ý nghĩa khi status = "uploading" | "paused".
 */
import type { ReactNode } from 'react';

export type UploadFileStatus = 'pending' | 'uploading' | 'paused' | 'success' | 'error';

export interface UploadFile {
  id: string;
  /** File object gốc (chỉ tồn tại với file user vừa chọn local) */
  file?: File;
  name: string;
  size: number;
  /** MIME type — chuẩn hoá lowercase */
  type: string;
  status: UploadFileStatus;
  /** 0–100, có ý nghĩa với uploading/paused */
  progress: number;
  /** URL trả về sau khi upload success (để preview/download) */
  url?: string;
  /**
   * Id tài sản BE (`POST /assets`, p0-05) — chỉ có khi tệp đi qua `core/uploads/asset-upload.adapter`.
   * Có sớm (ngay sau khi BE đăng ký), trước lúc tải xong; module nghiệp vụ dùng nó để gắn tệp
   * (vd đổi avatar) và xin URL ký bằng `GET /assets/:id/url`.
   */
  assetId?: string;
  /** Object URL local cho preview (image/pdf) — auto-revoke khi remove */
  previewUrl?: string;
  /** Error message khi status = "error" */
  error?: string;
  /** Metadata bổ sung — caller tự định nghĩa */
  meta?: Record<string, unknown>;
}

/**
 * - `dropzone` — vùng dashed border, hero icon, nút "Chọn file".
 * - `inline`   — hàng gọn trông NHƯ Ô NHẬP (viền + nền `bg-bg-input`).
 * - `button`   — đúng một `<Button>` kit2, không có khung ô nhập.
 *
 * ⚠️ `inline` đọc ra là "ô để gõ", nên KHÔNG dùng nó cho một hành động
 * (quét/tải lên). Người dùng nhìn thấy viền + nền input là tưởng gõ được vào
 * đó — đã gặp đúng phản hồi này. Hành động thì dùng `button`.
 */
export type UploadVariant = 'dropzone' | 'inline' | 'button';

export type UploadSize = 'sm' | 'md' | 'lg';

/**
 * Per-file upload callback. Trả về URL sau khi upload xong (handler theo tài sản BE trả **id tài sản** —
 * xem `createAssetUploader`).
 * `onProgress(0–100)` để cập nhật progress bar. AbortSignal để hỗ trợ cancel.
 *
 * `id` / `onAssetId` chỉ do hàng đợi (`upload-queue.store`) truyền: `id` là id task, ổn định qua "Thử lại"
 * (dùng làm `Idempotency-Key`); `onAssetId` ghi `UploadFile.assetId`. `useUpload` không truyền — handler
 * phải chịu được thiếu cả hai.
 */
export type UploadHandler = (
  file: File,
  helpers: {
    onProgress: (percent: number) => void;
    signal: AbortSignal;
    id?: string;
    onAssetId?: (assetId: string) => void;
  },
) => Promise<string>;

export interface ValidationError {
  code: 'file-too-large' | 'file-invalid-type' | 'too-many-files' | 'duplicate';
  message: string;
}

export interface FileTypeStyle {
  /** Icon name (hệ thống SystemIcon) — fallback nếu chưa có icon dành riêng */
  iconName: string;
  /** Label hiển thị trên badge icon (PDF, DOCX, …). 3-4 ký tự. */
  label: string;
  /** Skin (text + bg color tokens) cho badge icon */
  skin: 'red' | 'blue' | 'green' | 'orange' | 'purple' | 'neutral' | 'sky';
}

export interface UploadIconSlots {
  /** Icon hero (large) trong dropzone empty state */
  hero?: ReactNode;
  /** Icon prefix trong inline variant */
  inlinePrefix?: ReactNode;
}
