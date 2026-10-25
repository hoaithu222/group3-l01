import type { PrintOrderStatus, PrintOrderView } from '../api/o2o.types';
import { PIN_LIVE_STATUSES } from '../constants/o2o.constants';

/** Đơn đã kết thúc — không còn hành động nào ngoài xem (khớp `TERMINAL_ORDER_STATUSES` của BE). */
export function isTerminalStatus(status: PrintOrderStatus): boolean {
  return (
    status === 'PICKED_UP' ||
    status === 'REJECTED' ||
    status === 'CANCELLED' ||
    status === 'EXPIRED'
  );
}

/** Đơn nháp — chưa gửi tiệm (tiệm chưa thấy, PIN chưa có). */
export function isDraftStatus(status: PrintOrderStatus): boolean {
  return status === 'DRAFT' || status === 'QUOTED';
}

/** PIN còn hiệu lực ở trạng thái này (đã gửi, chưa kết thúc) — hết là app phải xoá PIN khỏi kho khoá. */
export function isPinLive(status: PrintOrderStatus): boolean {
  return PIN_LIVE_STATUSES.includes(status);
}

/** Job `print.count-pages` còn chạy: đơn nháp, chưa có số trang, chưa có lỗi. */
export function isCountingPages(
  order: Pick<PrintOrderView, 'status' | 'pages' | 'pageCountError'>,
): boolean {
  return isDraftStatus(order.status) && order.pages === null && order.pageCountError === null;
}

/**
 * Đơn nháp KHÔNG gửi được vì tệp (job báo lỗi): `O2O_003` (không đọc được/không phải PDF) hoặc `O2O_011` (quá số trang).
 * `O2O_002`/`O2O_012` là lỗi CẤU HÌNH (sửa ở form), không phải lỗi tệp.
 */
export function fileProblemCode(
  order: Pick<PrintOrderView, 'pageCountError'>,
): 'O2O_003' | 'O2O_011' | null {
  return order.pageCountError === 'O2O_003' || order.pageCountError === 'O2O_011'
    ? order.pageCountError
    : null;
}

/** Vị trí của trạng thái trên đường đi chuẩn (0…4), `-1` khi rẽ nhánh (từ chối/huỷ/hết hạn) hoặc còn là nháp. */
export function progressIndex(
  status: PrintOrderStatus,
  steps: readonly PrintOrderStatus[],
): number {
  return steps.indexOf(status);
}
