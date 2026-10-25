import type { RecordingLayout, RecordingStatus, RecordingStopReason } from "@prisma/client";

/**
 * Biên bản & ghi hình cuộc họp (p2-06) — thực thể miền + DTO. `RecapEntity`/`RecordingEntity` là bản đọc từ repository (Date, không lộ kiểu Prisma
 * ra service); DTO là những gì client thấy (chuỗi ISO, cờ `myActions` do SERVER tính).
 */

export type RecordingStatusValue = RecordingStatus;
export type RecordingLayoutValue = RecordingLayout;
export type RecordingStopReasonValue = RecordingStopReason;

/** Trạng thái ghi hình "đang chạy": chiếm slot egress, người vào sau phải đồng ý mới được phát, không xoá được. */
export const ACTIVE_RECORDING_STATUSES: readonly RecordingStatusValue[] = ["STARTING", "RECORDING", "STOPPING"];
/** Trạng thái có thể còn tệp trên storage (dùng cho retention/stuck-check). */
export const FINISHED_RECORDING_STATUSES: readonly RecordingStatusValue[] = ["READY", "FAILED"];

export interface RecapEntity {
  id: string;
  meetingId: string;
  workspaceId: string;
  /** Bản NHÁP đang sửa. */
  content: string;
  /** Bản đã công bố — người xem (không phải người sửa) chỉ thấy bản này. */
  publishedContent: string | null;
  /** Tệp đính kèm tại thời điểm công bố. */
  publishedAssetIds: string[];
  startedAt: Date | null;
  endedAt: Date | null;
  authorId: string;
  lastEditedBy: string;
  publishedAt: Date | null;
  publishedBy: string | null;
  publishedVersion: number | null;
  systemMessageId: string | null;
  attachmentCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewRecap = Pick<RecapEntity, "meetingId" | "workspaceId" | "content" | "startedAt" | "endedAt" | "authorId" | "lastEditedBy">;

/** Trường sửa được (mọi lần ghi `version + 1`, CAS theo `expectedVersion`). */
export type RecapPatch = Partial<
  Pick<RecapEntity, "content" | "startedAt" | "endedAt" | "lastEditedBy" | "publishedContent" | "publishedAssetIds" | "publishedAt" | "publishedBy" | "publishedVersion">
>;

export interface ConsentEntry {
  userId: string;
  at: Date;
  lateJoin: boolean;
}

export interface RecordingEntity {
  id: string;
  meetingId: string;
  workspaceId: string;
  callId: string;
  requestId: string;
  egressId: string | null;
  layout: RecordingLayoutValue;
  status: RecordingStatusValue;
  storageKey: string;
  assetId: string | null;
  fileSizeBytes: number | null;
  startedBy: string;
  consentSnapshot: ConsentEntry[];
  startedAt: Date;
  stoppedAt: Date | null;
  stoppedBy: string | null;
  stopReason: RecordingStopReasonValue | null;
  durationSec: number | null;
  error: string | null;
  importAttempts: number;
  retentionExpiresAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  deleteReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewRecording = Pick<RecordingEntity, "meetingId" | "workspaceId" | "callId" | "requestId" | "layout" | "storageKey" | "startedBy" | "consentSnapshot"> & {
  id: string;
  startedAt: Date;
};

export type RecordingPatch = Partial<
  Pick<
    RecordingEntity,
    | "egressId"
    | "status"
    | "assetId"
    | "fileSizeBytes"
    | "startedAt"
    | "stoppedAt"
    | "stoppedBy"
    | "stopReason"
    | "durationSec"
    | "error"
    | "importAttempts"
    | "retentionExpiresAt"
  >
>;

// ── DTO ────────────────────────────────────────────────────────────────────

export interface RecapAttachmentDto {
  assetId: string;
  name: string;
  mime: string;
  size: number | null;
}

export interface RecapDto {
  meetingId: string;
  /** `null` = chưa có bản ghi (nháp rỗng ảo, `version = 0`) — chỉ người sửa nhận được. */
  recapId: string | null;
  content: string;
  startedAt?: string;
  endedAt?: string;
  authorId: string;
  lastEditedBy: string;
  publishedAt?: string;
  publishedBy?: string;
  publishedVersion?: number;
  hasUnpublishedChanges: boolean;
  version: number;
  attachments: RecapAttachmentDto[];
  myActions: { canEdit: boolean; canPublish: boolean };
  serverNow: string;
}

export interface RecordingDto {
  id: string;
  meetingId: string;
  status: RecordingStatusValue;
  layout: RecordingLayoutValue;
  startedBy: string;
  startedAt: string;
  stoppedAt?: string;
  stopReason?: RecordingStopReasonValue;
  durationSec?: number;
  fileSizeBytes?: number;
  retentionExpiresAt?: string;
  /** Chỉ người điều khiển thấy, đã làm sạch (không URL ký/khoá S3). */
  error?: string;
  /** Số người đã đồng ý — KHÔNG có danh sách tên. */
  consentCount: number;
  myActions: { canStop: boolean; canDownload: boolean; canDelete: boolean; canRetry: boolean };
  serverNow: string;
}

export interface ConsentStatusDto {
  requestId: string;
  expiresAt: string;
  connectedCount: number;
  acceptedCount: number;
  declinedCount: number;
  pendingCount: number;
  ready: boolean;
}

/** Trạng thái ghi hình hiện tại của phòng cho người vào sau/reconnect (`JoinResultDto.recording`, `RoomSnapshotDto.recording`). */
export interface RoomRecordingStateDto {
  /** `CONSENT_REQUESTED` khi chủ trì đã hỏi ý kiến nhưng chưa bắt đầu ghi. */
  status: "CONSENT_REQUESTED" | RecordingStatusValue;
  /** Người này CHƯA đồng ý (chưa trả lời yêu cầu / vào sau khi đang ghi) — app hiện hộp thoại đồng ý. */
  consentRequired: boolean;
  startedBy?: string;
  startedAt?: string;
  recordingId?: string;
  requestId?: string;
  expiresAt?: string;
}
