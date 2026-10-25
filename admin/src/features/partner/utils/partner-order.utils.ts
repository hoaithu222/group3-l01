import { QUEUE_COLUMNS } from '../constants/partner.constants';
import type { PartnerOrder } from '../types/partner.types';

type QueueGroups = Record<(typeof QUEUE_COLUMNS)[number]['status'], PartnerOrder[]>;

/** Mốc "đã chờ từ khi nào": lúc GỬI (khách bấm gửi), lùi về lúc tạo nếu thiếu. */
const waitingSince = (o: PartnerOrder): number => Date.parse(o.submittedAt ?? o.createdAt);

/**
 * Chia đơn vào bốn cột Kanban theo `status`, mỗi cột xếp CŨ NHẤT LÊN TRƯỚC — hàng đợi làm theo thứ tự đến, đơn chờ lâu nhất nằm trên
 * cùng (BE trả mới nhất trước vì cursor theo `createdAt` giảm dần). Đơn ngoài bốn trạng thái (không nên xuất hiện) bị bỏ.
 */
export function groupByStatus(orders: readonly PartnerOrder[]): QueueGroups {
  const groups: QueueGroups = { PENDING: [], ACCEPTED: [], PRINTING: [], READY: [] };
  for (const o of orders) {
    if (
      o.status === 'PENDING' ||
      o.status === 'ACCEPTED' ||
      o.status === 'PRINTING' ||
      o.status === 'READY'
    ) {
      groups[o.status].push(o);
    }
  }
  for (const list of Object.values(groups)) list.sort((a, b) => waitingSince(a) - waitingSince(b));
  return groups;
}

/** "Vừa gửi" / "12 phút" / "2 giờ 5 phút" / "3 ngày" — thời gian đã chờ tính tới `nowMs`. Không hợp lệ/tương lai → "Vừa gửi". */
export function formatWaiting(order: PartnerOrder, nowMs: number): string {
  const since = waitingSince(order);
  const minutes = Number.isFinite(since) ? Math.floor((nowMs - since) / 60_000) : 0;
  if (minutes < 1) return 'Vừa gửi';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours} giờ` : `${hours} giờ ${minutes % 60} phút`;
  return `${Math.floor(hours / 24)} ngày`;
}
