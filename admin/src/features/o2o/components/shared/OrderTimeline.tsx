import { memo } from 'react';

import { Badge } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import { PRINT_EVENT_LABELS, PRINT_ORDER_STATUS_META } from '../../constants/print.constants';
import type { PrintOrderEvent, PrintOrderStatus } from '../../types/print.types';
import { shortId } from '../../utils/print.utils';

export interface OrderTimelineProps {
  events: readonly PrintOrderEvent[];
  /** Để gọi đúng tên "Khách" khi `by` trùng chủ đơn (view vận hành có `customer.id`). */
  customerId?: string;
}

/** "Khách" / "Hệ thống" / "Tài khoản …a1b2c3" — chỉ có ở view vận hành (chủ tiệm không nhận `by`). */
function actorOf(by: string | null | undefined, customerId?: string): string | null {
  if (by === undefined) return null;
  if (by === null) return 'Hệ thống';
  return by === customerId ? 'Khách' : `Tài khoản ${shortId(by)}`;
}

/**
 * Dòng thời gian của đơn in (admin.md p6-05 §2.3): trạng thái/sự kiện · lúc · ai · ghi chú, theo thứ tự BE ghi (cũ → mới).
 * Trạng thái vẽ bằng `Badge dot` cùng màu với badge trạng thái ở bảng; sự kiện không đổi trạng thái (tạo PIN mới, đã thu
 * tiền) dùng màu trung tính.
 */
const OrderTimeline = memo(function OrderTimeline({ events, customerId }: OrderTimelineProps) {
  if (events.length === 0) {
    return <p className="text-body-14 text-fg-4">Chưa có sự kiện nào.</p>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {events.map((e, i) => {
        const meta = PRINT_ORDER_STATUS_META[e.status as PrintOrderStatus];
        const actor = actorOf(e.by, customerId);
        return (
          <li key={`${e.status}-${e.at}-${i}`} className="flex items-start gap-2">
            <Badge className="mt-1.5" color={meta?.color ?? 'neutral'} dot />
            <div className="min-w-0">
              <div className="text-body-14 text-fg-1">
                {PRINT_EVENT_LABELS[e.status] ?? e.status}
              </div>
              <div className="text-caption-12 text-fg-4">
                <span className="tabular-nums">{formatDate(e.at, 'HH:mm:ss DD/MM/YYYY')}</span>
                {actor ? ` · ${actor}` : ''}
              </div>
              {e.note ? <div className="break-words text-body-14 text-fg-2">{e.note}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
});

export default OrderTimeline;
