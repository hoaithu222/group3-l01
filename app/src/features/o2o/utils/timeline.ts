import type { PrintOrderView } from '../api/o2o.types';
import { EVENT_LABEL, PROGRESS_STEPS } from '../constants/o2o.constants';

export interface TimelineRow {
  key: string;
  label: string;
  /** ISO — `null` cho bước CHƯA tới. */
  at: string | null;
  note: string | null;
  state: 'done' | 'current' | 'todo';
}

/** Trạng thái đã kết thúc chỉ có dòng "đã xảy ra", không có bước kế tiếp. */
const ENDED = ['PICKED_UP', 'REJECTED', 'CANCELLED', 'EXPIRED'];

/**
 * Dòng thời gian của đơn ĐÃ GỬI từ `events[]` của server (đơn nháp không có — tiệm chưa thấy đơn). Mỗi sự kiện là một dòng "đã làm" theo thứ tự
 * BE ghi; sự kiện `DRAFT`/`QUOTED` (nội bộ: đếm trang, báo giá) bị bỏ. Đơn đang đi đúng đường thì nối thêm các bước CHƯA tới (mờ) để người dùng
 * biết còn mấy bước; đơn rẽ nhánh (từ chối/huỷ/hết hạn) dừng ở dòng kết thúc. Dòng của trạng thái HIỆN TẠI đánh dấu `current`.
 */
export function buildTimeline(order: Pick<PrintOrderView, 'events' | 'status'>): TimelineRow[] {
  const rows: TimelineRow[] = order.events.flatMap((event, index) => {
    const label = EVENT_LABEL[event.status];
    if (label === undefined) return [];
    const state = event.status === order.status ? ('current' as const) : ('done' as const);
    return [{ key: `${event.status}-${index}`, label, at: event.at, note: event.note, state }];
  });

  if (ENDED.includes(order.status)) return rows;

  const reached = PROGRESS_STEPS.indexOf(order.status);
  if (reached < 0) return rows;
  const upcoming = PROGRESS_STEPS.slice(reached + 1).map((step) => ({
    key: `todo-${step}`,
    label: EVENT_LABEL[step] ?? step,
    at: null,
    note: null,
    state: 'todo' as const,
  }));
  return [...rows, ...upcoming];
}
