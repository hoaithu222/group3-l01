import { memo, useCallback } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { Button, EmptyState, SegmentToggle, Skeleton, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import {
  OVERVIEW_DEFAULT_WEEKS,
  OVERVIEW_WEEK_OPTIONS,
  OVERVIEW_WEEKS_PARAM,
} from '../constants/wellbeing.constants';
import { useWellbeingOverview } from '../service/wellbeing.queries';
import { parseOverviewWeeks } from '../utils/overview.utils';
import WellbeingKpis from './WellbeingKpis';
import WellbeingLoadError from './WellbeingLoadError';
import WellbeingPanels from './WellbeingPanels';

/**
 * Nhóm "Tổng quan ẩn danh" (admin.md p7-03 §2.1) — `GET /admin/wellbeing/overview?weeks`: hai thẻ số liệu + biểu đồ kèm bảng thay thế. Số liệu do BE ẩn danh hoá (k ≥ 20 người,
 * làm tròn, che ô nhỏ, gộp nhóm nhỏ) — màn hình chỉ hiển thị, không tự tính lại và KHÔNG có cách nào đi tới dữ liệu của một người. Khoảng 4/8/12 tuần sống trên URL (`?weeks=`).
 * Chưa đủ mẫu → giải thích thay vì vẽ số; tải lỗi → báo lỗi + "Thử lại", KHÔNG vẽ thẻ `0`.
 */
const WellbeingOverview = memo(function WellbeingOverview() {
  const { getParam, updateParams } = useQueryParams();
  const weeks = parseOverviewWeeks(getParam(OVERVIEW_WEEKS_PARAM));
  const { data, error, isLoading, isFetching, isPlaceholderData, refetch } =
    useWellbeingOverview(weeks);

  const handleRange = useCallback(
    (next: string) =>
      updateParams({
        [OVERVIEW_WEEKS_PARAM]: Number(next) === OVERVIEW_DEFAULT_WEEKS ? null : next,
      }),
    [updateParams],
  );

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        left={
          <SegmentToggle
            aria-label="Khoảng thời gian tổng quan sức khoẻ học tập"
            options={[...OVERVIEW_WEEK_OPTIONS]}
            size="sm"
            value={String(weeks)}
            variant="subtle"
            onValueChange={handleRange}
          />
        }
        right={
          <Button
            loading={isFetching && !isLoading}
            size="sm"
            startIcon={<SystemIcon name="arrows-rotate-outline" size={14} />}
            variant="ghost"
            onClick={() => void refetch()}
          >
            Làm mới
          </Button>
        }
      />
      {error && !data && (
        <WellbeingLoadError
          error={error}
          title="Không tải được tổng quan sức khoẻ học tập"
          onRetry={() => void refetch()}
        />
      )}
      <div className={cn('flex flex-col gap-3', isPlaceholderData && 'opacity-50')}>
        {/* Chưa có số (đang tải / tải lỗi) → thẻ hiện "—", không bao giờ 0. */}
        <WellbeingKpis data={data} />
        {isLoading && <Skeleton className="h-64 w-full" />}
        {data?.insufficient && (
          <EmptyState
            description={`Cần ít nhất ${data.minimum} người bật theo dõi mới hiển thị số liệu ẩn danh — khi nhóm còn nhỏ, một con số có thể làm lộ một cá nhân cụ thể.`}
            icon="shield-check-bold"
            size="sm"
            title={`Chưa đủ người tham gia — cần ít nhất ${data.minimum} người`}
          />
        )}
        {data && !data.insufficient && (
          <WellbeingPanels
            alertsPerWeek={data.alertsPerWeek}
            levelDistribution={data.levelDistribution}
          />
        )}
      </div>
    </div>
  );
});

export default WellbeingOverview;
