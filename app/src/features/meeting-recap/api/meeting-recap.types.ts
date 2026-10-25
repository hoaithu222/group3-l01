/**
 * Kiểu DTO của biên bản & ghi hình cuộc họp (p2-06) — khai TAY, khớp MÃ BE thật
 * (`be/src/modules/meetings/entities/meeting-recap.interface.ts`, `controllers/meeting-recording.controller.ts`). Chỗ nào mã khác
 * `be.md` thì mã thắng: `RecapDto.recapId` (`null` = nháp rỗng ảo `version = 0`), `serverNow`, `RecordingDto.stopReason`.
 */

export type RecordingStatus = 'STARTING' | 'RECORDING' | 'STOPPING' | 'PROCESSING' | 'READY' | 'FAILED';
export type RecordingLayout = 'GRID' | 'SPEAKER';
export type RecordingStopReason = 'HOST_STOPPED' | 'MEETING_ENDED' | 'MAX_DURATION' | 'EGRESS_FAILED' | 'RETENTION';
export type RecordingUrlPurpose = 'STREAM' | 'DOWNLOAD';

export interface RecapAttachment {
  assetId: string;
  mime: string;
  name: string;
  size: number | null;
}

export interface RecapDto {
  attachments: RecapAttachment[];
  authorId: string;
  content: string;
  endedAt?: string;
  /** Chỉ người sửa: có nội dung chưa công bố (chưa công bố lần nào ⇒ luôn `true`). */
  hasUnpublishedChanges: boolean;
  lastEditedBy: string;
  meetingId: string;
  myActions: { canEdit: boolean; canPublish: boolean };
  publishedAt?: string;
  publishedBy?: string;
  publishedVersion?: number;
  /** `null` = CHƯA có bản ghi — nháp rỗng ảo (`version = 0`), lần lưu đầu KHÔNG gửi `expectedVersion`. */
  recapId: string | null;
  serverNow: string;
  startedAt?: string;
  version: number;
}

export interface UpsertRecapBody {
  content: string;
  endedAt?: string;
  /** Bỏ trống CHỈ ở lần lưu đầu (`recapId = null`); sau đó bắt buộc — lệch → 409 `RES_003`. */
  expectedVersion?: number;
  startedAt?: string;
}

export interface RecordingDto {
  consentCount: number;
  durationSec?: number;
  /** Chỉ người điều khiển thấy, đã làm sạch (không URL ký/khoá object). */
  error?: string;
  fileSizeBytes?: number;
  id: string;
  layout: RecordingLayout;
  meetingId: string;
  myActions: { canDelete: boolean; canDownload: boolean; canRetry: boolean; canStop: boolean };
  retentionExpiresAt?: string;
  serverNow: string;
  startedAt: string;
  startedBy: string;
  status: RecordingStatus;
  stopReason?: RecordingStopReason;
  stoppedAt?: string;
}

/** `GET /recordings/:id/url` — STREAM ký 900 s (ngoại lệ có chủ đích cho video dài), DOWNLOAD 60 s dùng ngay. */
export interface RecordingUrl {
  expiresAt: string;
  mime: string;
  url: string;
}

// ── socket (BE `meeting-recap-recording.events.ts`, `recording-signals.ts`) ──────────────────────────────

export interface RecapPublishedPayload {
  firstPublish: boolean;
  meetingId: string;
  publishedVersion: number;
  recapId: string;
}

export interface RecordingUpdatedPayload {
  deleted?: boolean;
  durationSec?: number;
  meetingId: string;
  recordingId: string;
  retentionExpiresAt?: string;
  status: RecordingStatus;
}
