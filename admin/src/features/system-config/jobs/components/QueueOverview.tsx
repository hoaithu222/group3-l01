import { memo } from 'react';

import { Button, BoxGrid, Callout, EmptyState, Skeleton, Text, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { QUEUES_REFETCH_MS, useQueuesOverview } from '../service/jobs.queries';
import { formatEpoch } from '../utils/jobs-format';
import QueueCard from './QueueCard';
import SchedulerTable from './SchedulerTable';

/**
 * Sub-tab "Hàng đợi" (admin.md p0-04 §2.1) — KPI mỗi queue + bảng lịch định
 * kỳ. Tự làm mới mỗi 15 s (`refetchInterval` ở hook) + nút "Làm mới".
 */
const QueueOverview = memo(function QueueOverview() {
  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useQueuesOverview();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        intent="error"
        title="Không tải được số liệu hàng đợi"
      />
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState description="Hệ thống chưa khai báo hàng đợi nào." title="Chưa có hàng đợi" />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Toolbar
        left={
          <Text size="tiny" skin="muted">
            Tự làm mới mỗi {QUEUES_REFETCH_MS / 1000} giây · cập nhật lúc{' '}
            {formatEpoch(dataUpdatedAt)}
          </Text>
        }
        right={
          <Button
            loading={isFetching}
            size="sm"
            startIcon={<SystemIcon name="arrows-rotate-outline" size={14} />}
            variant="stroke"
            onClick={() => void refetch()}
          >
            Làm mới
          </Button>
        }
      />
      <BoxGrid gap="sm" min="lg">
        {data.map((queue) => (
          <QueueCard key={queue.name} queue={queue} />
        ))}
      </BoxGrid>
      <SchedulerTable queues={data} />
    </div>
  );
});

export default QueueOverview;
