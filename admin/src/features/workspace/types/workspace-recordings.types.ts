/**
 * Kiểu dữ liệu tab `recordings` (p2-06 admin.md §2) — khớp `AdminRecordingRow` / `AdminRecordingDetail` / `AdminRecordingSummary` phía BE
 * (`be/src/modules/meetings/services/admin-recording.service.ts`, `repositories/admin-recording.reader.ts`).
 *
 * CHỈ metadata vận hành: BE cố ý KHÔNG trả mã họp, người tham dự, tên người đồng ý (chỉ `consentCount`), URL ký hay nội dung biên bản, và không có
 * endpoint phát/tải cho admin (D-24). Đừng thêm các trường đó vào đây; đổi hợp đồng thì đối chiếu lại `admin-recording.reader.ts` (select tối thiểu).
 */

export type RecordingStatusValue =
  'STARTING' | 'RECORDING' | 'STOPPING' | 'PROCESSING' | 'READY' | 'FAILED';
export type RecordingLayoutValue = 'GRID' | 'SPEAKER';
export type RecordingStopReasonValue =
  'HOST_STOPPED' | 'MEETING_ENDED' | 'MAX_DURATION' | 'EGRESS_FAILED' | 'RETENTION';

/** Khoá sắp xếp BE nhận (`-` = giảm dần). */
export type RecordingSortKey = 'startedAt' | 'durationSec' | 'fileSizeBytes' | 'retentionExpiresAt';
export type RecordingSortValue = RecordingSortKey | `-${RecordingSortKey}`;

/** `name` = `null` khi tài khoản/cuộc họp/nhóm không còn. */
interface NamedRef {
  id: string;
  name: string | null;
}

export interface AdminRecordingRow {
  id: string;
  /** Tiêu đề cuộc họp (metadata) — KHÔNG có mã họp. */
  meeting: { id: string; title: string | null };
  workspace: NamedRef;
  startedBy: NamedRef;
  status: RecordingStatusValue;
  layout: RecordingLayoutValue;
  /** ISO UTC. */
  startedAt: string;
  stoppedAt: string | null;
  durationSec: number | null;
  fileSizeBytes: number | null;
  retentionExpiresAt: string | null;
  /** Số ngày còn lại tới hạn lưu trữ (âm = đã quá hạn); `null` khi chưa có hạn. */
  retentionDaysLeft: number | null;
  deletedAt: string | null;
  deleteReason: string | null;
  /** Lỗi egress ĐÃ làm sạch (không URL ký, không khoá S3). */
  error: string | null;
}

export interface AdminRecordingDetail extends AdminRecordingRow {
  callId: string;
  egressId: string | null;
  stoppedBy: NamedRef | null;
  stopReason: RecordingStopReasonValue | null;
  /** Số người đã đồng ý — KHÔNG có danh sách tên. */
  consentCount: number;
  /** Khoá object che một phần (`recordings/…/<id>.mp4`). */
  storageKeyMasked: string;
  /** Kết quả `HEAD` object lúc mở; `null` khi không kiểm được (storage lỗi) hoặc bản đã xoá/chưa có tệp. */
  object: { exists: boolean; sizeBytes: number | null } | null;
}

export interface AdminRecordingSummary {
  recordingStorageBytes: number;
  storageBytes30dAgo: number;
  readyCount: number;
  expiringIn7d: number;
  failed24h: number;
}

/** `GET /admin/recordings` — `status` là CSV (`READY,FAILED`); `from`/`to` lọc theo GIỜ BẮT ĐẦU GHI (ISO, gồm hai đầu). */
export interface AdminRecordingListParams {
  page: number;
  limit: number;
  status?: string;
  workspaceId?: string;
  /** Chỉ bản ghi của MỘT cuộc họp (BE `adminRecordingListQuerySchema.meetingId`, id sai định dạng → 400). */
  meetingId?: string;
  from?: string;
  to?: string;
  expiringWithinDays?: number;
  includeDeleted?: boolean;
  sort?: RecordingSortValue;
}
