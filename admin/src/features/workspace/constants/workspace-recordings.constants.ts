import type {
  RecordingLayoutValue,
  RecordingSortKey,
  RecordingStatusValue,
  RecordingStopReasonValue,
} from '../types/workspace-recordings.types';

/** Số liệu chưa có (đang tải / tải lỗi) — hiện `—`, KHÔNG bao giờ `0` (api-patterns.md, trạng thái lỗi tải). */
export const NO_DATA = '—';

/** Dòng mỗi trang của tab "Ghi hình" (admin.md p2-06 §2.2: 20/50/100). */
export const RECORDING_PAGE_SIZE = 20;
export const RECORDING_PAGE_SIZE_OPTIONS = [20, 50, 100];

/** Khoá URL RIÊNG của tab — không dính bộ lọc/phân trang của các tab cùng trang (`page`, `meetingStatus`…). */
export const RECORDING_URL_KEYS = {
  page: 'recPage',
  pageSize: 'recPageSize',
  status: 'recStatus',
  from: 'recFrom',
  to: 'recTo',
  sort: 'recSort',
  expiring: 'recExpiring',
  deleted: 'recDeleted',
  detail: 'recId',
} as const;

/** Cờ `meeting` tắt giữa chừng (capabilities cache 5 phút) → BE trả 404 với mã này: hiện "đang tắt", không phải lỗi. */
export const RECORDING_FEATURE_OFF_CODE = 'CFG_005';

/** Lỗi xoá mà thử lại cũng vẫn thế (đã xoá `REC_005` / còn đang ghi `MEET_009`) — đóng hộp thoại thay vì giữ mở. */
export const RECORDING_DELETE_FINAL_CODES: readonly string[] = ['REC_005', 'MEET_009'];

/** "Sắp hết hạn" = trong vòng bấy nhiêu ngày (khớp thẻ tóm tắt `expiringIn7d`). */
export const RECORDING_EXPIRING_DAYS = 7;

/** Trạng thái ĐANG CHẠY: chiếm slot egress, BE từ chối xoá (`MEET_009`) — nút Xoá tắt kèm lý do. */
export const RECORDING_ACTIVE_STATUSES: readonly RecordingStatusValue[] = [
  'STARTING',
  'RECORDING',
  'STOPPING',
];

/** Thứ tự vòng đời — dùng cho ô lọc trạng thái (nhãn chữ khớp `statusBadge('recording', …)`). */
export const RECORDING_STATUS_OPTIONS: ReadonlyArray<{
  value: RecordingStatusValue;
  label: string;
}> = [
  { value: 'STARTING', label: 'Đang bắt đầu' },
  { value: 'RECORDING', label: 'Đang ghi' },
  { value: 'STOPPING', label: 'Đang dừng' },
  { value: 'PROCESSING', label: 'Đang xử lý' },
  { value: 'READY', label: 'Sẵn sàng' },
  { value: 'FAILED', label: 'Lỗi' },
];

export const RECORDING_LAYOUT_LABELS: Record<RecordingLayoutValue, string> = {
  GRID: 'Lưới',
  SPEAKER: 'Người đang nói',
};

export const RECORDING_STOP_REASON_LABELS: Record<RecordingStopReasonValue, string> = {
  HOST_STOPPED: 'Chủ trì dừng ghi',
  MEETING_ENDED: 'Cuộc họp kết thúc',
  MAX_DURATION: 'Quá thời lượng ghi tối đa',
  EGRESS_FAILED: 'Hệ thống ghi hình gặp lỗi',
  RETENTION: 'Hết hạn lưu trữ',
};

/** Cột sắp xếp được ↔ khoá `sort` của BE. Mặc định: bắt đầu ghi mới → cũ. */
export const RECORDING_SORT_KEYS: readonly RecordingSortKey[] = [
  'startedAt',
  'durationSec',
  'fileSizeBytes',
  'retentionExpiresAt',
];
export const RECORDING_DEFAULT_SORT = { key: 'startedAt', dir: 'desc' } as const;

/** Chú thích quyền riêng tư đầu tab (D-24) — nói thẳng admin KHÔNG xem được gì để không ai hiểu nhầm là thiếu tính năng. */
export const RECORDING_PRIVACY_NOTE =
  'Vì quyền riêng tư, trang quản trị chỉ hiển thị thông tin vận hành của bản ghi (dung lượng, thời lượng, trạng thái, hạn lưu trữ). Quản trị viên không phát, không tải và không xem trước nội dung bản ghi hay biên bản họp.';

/** Nhận xét khi cờ phụ ghi hình tắt/không khả dụng — bản ghi cũ vẫn hiển thị và xoá được. */
export const RECORDING_UNAVAILABLE_NOTE =
  'Ghi hình đang tắt hoặc chưa khả dụng trên hệ thống này (cần S3/MinIO + LiveKit Egress). Các bản ghi đã có vẫn hiển thị bên dưới.';
