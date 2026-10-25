import type { PrintOrderStatus } from '@/features/o2o';

/** Trạng thái đơn hiện ở hàng đợi (bốn cột Kanban) — theo thứ tự luồng việc của tiệm. Đơn đã xong/bị từ chối/huỷ/hết hạn KHÔNG ở đây. */
export const QUEUE_COLUMNS: ReadonlyArray<{
  status: Extract<PrintOrderStatus, 'PENDING' | 'ACCEPTED' | 'PRINTING' | 'READY'>;
  title: string;
  empty: string;
}> = [
  { status: 'PENDING', title: 'Mới', empty: 'Chưa có đơn mới' },
  { status: 'ACCEPTED', title: 'Đã nhận', empty: 'Chưa có đơn đã nhận' },
  { status: 'PRINTING', title: 'Đang in', empty: 'Không có đơn đang in' },
  { status: 'READY', title: 'Sẵn sàng', empty: 'Không có đơn chờ khách lấy' },
];

/** Giá trị `status=` gửi BE cho hàng đợi (phân tách bằng dấu phẩy — BE không nhận key lặp). */
export const QUEUE_STATUS_PARAM = QUEUE_COLUMNS.map((c) => c.status).join(',');

/** `limit` của `GET /partner/orders` (trần BE = `LIMITS.pagination.max`). Hàng đợi hiếm khi vượt; vượt thì có "Tải thêm". */
export const QUEUE_PAGE_LIMIT = 100;

/**
 * Làm mới hàng đợi định kỳ làm ĐƯỜNG LÙI khi socket mất kết nối (chủ tiệm treo màn cả ngày): socket `partner:order` vẫn là
 * đường chính, tần suất này chỉ để không bỏ sót đơn khi rớt mạng.
 */
export const QUEUE_REFETCH_MS = 60_000;

/** Độ dài lý do từ chối — khớp `partnerRejectSchema` BE (`LIMITS.o2o.rejectReasonMin/Max`). */
export const REJECT_REASON_MIN = 3;
export const REJECT_REASON_MAX = 200;

/** PIN nhận hàng 6 chữ số (`PIN_PATTERN` BE). */
export const PIN_LENGTH = 6;

/** Khoá localStorage bật/tắt âm báo đơn mới (mỗi trình duyệt/máy tính tiệm tự nhớ). */
export const SOUND_STORAGE_KEY = 'partner:new-order-sound';

/** Mã lỗi BE mà cổng chủ tiệm xử lý riêng (`error.codes.ts`). */
export const PICKUP_ERROR = {
  wrongPin: 'O2O_007',
  locked: 'O2O_008',
  invalidState: 'O2O_004',
} as const;
