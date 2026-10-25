import { Progress, type ProgressStatus, type ProgressStepItem } from '@/shared/ui/progress';
import { Section } from '@/shared/ui/section';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { PrintOrderStatus, PrintOrderView } from '../api/o2o.types';
import { buildTimeline, type TimelineRow } from '../utils/timeline';

/** Kết thúc KHÔNG thành: tiệm từ chối / quá hạn ⇒ chấm đỏ. ⚠️ Huỷ do chính người dùng không phải "lỗi" nên đi nhánh `done`. */
const FAILED_END: readonly PrintOrderStatus[] = ['REJECTED', 'EXPIRED'];

function stepStatus(row: TimelineRow, orderStatus: PrintOrderStatus): ProgressStatus {
  if (row.state === 'todo') return 'pending';
  if (row.state === 'done') return 'done';
  if (FAILED_END.includes(orderStatus)) return 'error';
  // Đơn đã nhận/đã huỷ: bước hiện tại là bước CUỐI, đã xong — không còn "đang xử lý".
  if (orderStatus === 'PICKED_UP' || orderStatus === 'CANCELLED') return 'done';
  return 'current';
}

/**
 * Dòng thời gian đơn (app.md §2 `OrderTimeline`) dựng bằng stepper DỌC dùng chung (`Progress`): bước đã qua (chấm đặc + giờ), bước hiện tại
 * (quầng sáng, chữ đậm), bước sắp tới (vòng rỗng, dòng phụ "Chưa tới"). Nhãn CHỮ đủ nghĩa — trạng thái bước được `ProgressStep` đọc thành lời
 * ("Bước 2, chưa thực hiện: …"), chấm/màu chỉ bổ trợ. Đơn nháp chưa gửi thì không có gì để hiện → không vẽ khối.
 */
export function OrderTimeline({ order }: { order: Pick<PrintOrderView, 'events' | 'status'> }) {
  const rows = buildTimeline(order);
  if (rows.length === 0) return null;

  const steps: ProgressStepItem[] = rows.map((row) => ({
    description: row.note ?? undefined,
    id: row.key,
    meta: row.at ? formatDateTime(row.at) : 'Chưa tới',
    status: stepStatus(row, order.status),
    title: row.label,
  }));

  return (
    <Section icon="history" title="Tiến trình">
      <Progress steps={steps} />
    </Section>
  );
}
