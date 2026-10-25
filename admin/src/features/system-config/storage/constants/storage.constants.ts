/**
 * Hằng số tab "Lưu trữ": nhãn tiếng Việt cho enum BE + màu chart.
 *
 * Nhãn KHÔNG có trong khai báo nào thì hiện chính mã (`labelOf`) — BE thêm
 * `scope`/`kind` mới thì UI vẫn đọc được, chỉ chưa đẹp.
 */

/** Thứ tự trạng thái cố định — luôn đủ 5 hàng kể cả khi chưa có tệp nào (BE chỉ trả nhóm có dữ liệu). */
export const STORAGE_STATUS_ORDER = [
  'UPLOADING',
  'PROCESSING',
  'READY',
  'REJECTED',
  'DELETED',
] as const;

export const STORAGE_STATUS_LABELS: Readonly<Record<string, string>> = {
  UPLOADING: 'Đang tải lên',
  PROCESSING: 'Đang xử lý',
  READY: 'Sẵn sàng',
  REJECTED: 'Bị từ chối',
  DELETED: 'Đã xoá',
};

export const STORAGE_KIND_LABELS: Readonly<Record<string, string>> = {
  IMAGE: 'Ảnh',
  VIDEO: 'Video',
  AUDIO: 'Âm thanh',
  VOICE: 'Tin nhắn thoại',
  FILE: 'Tệp / tài liệu',
};

export const STORAGE_SCOPE_LABELS: Readonly<Record<string, string>> = {
  MESSAGE: 'Tin nhắn',
  RESOURCE: 'Tài nguyên',
  AVATAR: 'Ảnh đại diện',
  TASK: 'Công việc',
  DOC: 'Tài liệu',
  PRINT: 'In ấn',
  WORKSPACE: 'Workspace',
  MEETING: 'Cuộc họp',
  RECORDING: 'Bản ghi',
};

export const STORAGE_TYPE_LABELS: Readonly<Record<string, string>> = {
  local: 'Local',
  s3: 'Amazon S3',
  cloudinary: 'Cloudinary',
};

export const labelOf = (labels: Readonly<Record<string, string>>, key: string): string =>
  labels[key] ?? key;

/** Màu cột — chỉ token scale `-5` (chart-conventions §1.2). Cột thể hiện dung lượng nên dùng MỘT màu. */
export const CHART_COLORS = { bytes: 'info-5' } as const;

/** Bộ lọc workspace trên URL — tiền tố `storage` để không đụng khoá của tab khác cùng trang. */
export const STORAGE_WORKSPACE_PARAM = 'storageWs';
export const STORAGE_WORKSPACE_NAME_PARAM = 'storageWsName';

/** ObjectId 24 hex — giá trị từ URL không hợp lệ thì bỏ qua thay vì gửi BE ăn `VAL_001`. */
export const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
