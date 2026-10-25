import { memo } from 'react';

import { Badge, BoxPanel, CompactKpiCard } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import type { QueueSummary } from '../types/jobs.types';

export interface QueueCardProps {
  queue: QueueSummary;
}

/**
 * Số liệu 1 hàng đợi — 4 KPI (Đang chờ · Đang chạy · Hẹn giờ · Lỗi).
 *
 * Lỗi > 0 KHÔNG chỉ đổi màu: thẻ "Lỗi" kèm `Badge` chữ "Có lỗi" (màu không phải
 * kênh thông tin duy nhất — `docs/rules/color-system.md`). `animate={false}` vì
 * số đổi theo nhịp làm mới 15 s, đếm-lên mỗi lần sẽ làm người đọc không kịp
 * đọc (xem docblock `CompactKpiCard.animate`).
 */
const QueueCard = memo(function QueueCard({ queue }: QueueCardProps) {
  const hasFailed = queue.failed > 0;

  return (
    <section aria-label={`Hàng đợi ${queue.name}`} className="flex flex-col">
      <BoxPanel
        border="hairline"
        className="h-auto flex-1"
        headerRight={
          queue.paused ? (
            <Badge color="neutral" size="sm" variant="tinted">
              Đang tạm dừng
            </Badge>
          ) : undefined
        }
        title={
          <span className="truncate font-mono text-body-14-medium text-fg-1">{queue.name}</span>
        }
      >
        <div className="grid grid-cols-2 gap-2 p-2">
          <CompactKpiCard
            animate={false}
            color="blue"
            icon="clock-bold"
            label="Đang chờ"
            size="xs"
            value={queue.waiting}
          />
          <CompactKpiCard
            animate={false}
            color="green"
            icon="play-bold"
            label="Đang chạy"
            size="xs"
            value={queue.active}
          />
          <CompactKpiCard
            animate={false}
            color="yellow"
            icon="calendar-clock-bold"
            label="Hẹn giờ"
            size="xs"
            value={queue.delayed}
          />
          <CompactKpiCard
            animate={false}
            color={hasFailed ? 'red' : 'gray'}
            icon="triangle-exclamation-bold"
            label="Lỗi"
            size="xs"
            trailing={
              hasFailed ? (
                <Badge
                  color="warning"
                  size="sm"
                  startIcon={<SystemIcon name="triangle-exclamation-outline" size={12} />}
                  variant="tinted"
                >
                  Có lỗi
                </Badge>
              ) : undefined
            }
            value={queue.failed}
          />
        </div>
      </BoxPanel>
    </section>
  );
});

export default QueueCard;
