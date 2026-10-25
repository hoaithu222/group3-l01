import { memo, useCallback } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { BoxPanel, Button, EmptyState, SegmentToggle, Skeleton, Text, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import {
  OVERVIEW_DAY_OPTIONS,
  OVERVIEW_DAYS_PARAM,
  OVERVIEW_DEFAULT_DAYS,
} from '../constants/economy.constants';
import { useEconomyOverview } from '../service/economy.queries';
import { hasEconomyFlow, parseOverviewDays } from '../utils/overview.utils';
import EconomyFlowChart from './EconomyFlowChart';
import EconomyFlowTable from './EconomyFlowTable';
import EconomyKpis from './EconomyKpis';
import EconomyLoadError from './EconomyLoadError';
import EconomyReconcileNotice from './EconomyReconcileNotice';
import TopItemsTable from './TopItemsTable';

/**
 * Nhóm "Tổng quan" (admin.md p7-02 §2.1) — `GET /admin/economy/overview?days`: năm thẻ số liệu, cảnh báo đối soát, đường phát hành/tiêu theo ngày
 * kèm bảng số liệu, top vật phẩm. Khoảng 7/14/30 ngày sống trên URL (`?days=`); đổi khoảng thì giữ số cũ mờ đi tới khi số mới về.
 * Tải lỗi → báo lỗi + "Thử lại", KHÔNG vẽ thẻ `0` (`api-patterns.md`).
 */
const EconomyOverview = memo(function EconomyOverview() {
  const { getParam, updateParams } = useQueryParams();
  const days = parseOverviewDays(getParam(OVERVIEW_DAYS_PARAM));
  const { data, error, isLoading, isFetching, isPlaceholderData, refetch } =
    useEconomyOverview(days);

  const handleRange = useCallback(
    (next: string) =>
      updateParams({ [OVERVIEW_DAYS_PARAM]: Number(next) === OVERVIEW_DEFAULT_DAYS ? null : next }),
    [updateParams],
  );

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        left={
          <SegmentToggle
            aria-label="Khoảng thời gian tổng quan xu"
            options={[...OVERVIEW_DAY_OPTIONS]}
            size="sm"
            value={String(days)}
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
        <EconomyLoadError
          error={error}
          title="Không tải được tổng quan kinh tế xu"
          onRetry={() => void refetch()}
        />
      )}
      <div className={cn('flex flex-col gap-3', isPlaceholderData && 'opacity-50')}>
        {/* Chưa có số (đang tải / tải lỗi) → thẻ hiện "—", không bao giờ 0. */}
        <EconomyKpis data={data} />
        {isLoading && <Skeleton className="h-64 w-full" />}
        {data && (
          <>
            <EconomyReconcileNotice report={data.reconcile} />
            <BoxPanel border="hairline" className="h-auto" title="Phát hành và tiêu xu theo ngày">
              <div className="flex flex-col gap-3 p-2">
                {hasEconomyFlow(data.perDay) ? (
                  <>
                    <EconomyFlowChart data={data.perDay} />
                    <Text weight="bold">Số liệu theo ngày</Text>
                    <EconomyFlowTable data={data.perDay} />
                  </>
                ) : (
                  <EmptyState
                    description="Chưa có giao dịch xu nào trong khoảng đã chọn."
                    icon="chart-simple-bold"
                    size="sm"
                    title="Chưa có dữ liệu"
                  />
                )}
              </div>
            </BoxPanel>
            <TopItemsTable items={data.topItems} />
          </>
        )}
      </div>
    </div>
  );
});

export default EconomyOverview;
