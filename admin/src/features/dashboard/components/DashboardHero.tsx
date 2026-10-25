import { memo } from 'react';

import { MODULE_BY_ID } from '@/app/router/modules/module-registry';
import type { AdminInsights, AdminOverviewMedia } from '@/core/api/admin';
import { PanelCard } from '@/shared/ui';
import { cn } from '@/shared/utils/style/cn';

import ActivityTrendPanel from './ActivityTrendPanel';
import OverviewMediaKpis from './OverviewMediaKpis';

export interface DashboardHeroProps {
  insights: AdminInsights | undefined;
  insightsLoading: boolean;
  insightsStale: boolean;
  /** `overview.media` — vắng khi cờ `meeting`/`voice` tắt ⇒ KHÔNG dựng cột "Gọi & họp". */
  media: AdminOverviewMedia | undefined;
  mediaLoading: boolean;
}

/**
 * Hàng HERO: biểu đồ xu hướng chiếm phần lớn bề ngang, cột phải là nhóm KPI "Gọi & họp" (bố cục màn điều hành kiểu `vci-sun-pms-fe`).
 *
 * Trang giờ dài hơn một màn hình (vùng cuộn ở `PageBody`) nên hàng này KHÔNG còn fill chiều cao còn lại: hàng lưới có SÀN `22rem` rồi nở theo nội
 * dung. Sàn đó cũng là chiều cao tối thiểu của biểu đồ — thiếu nó, chart `h-full` trong cha chiều cao `auto` sập về 0.
 *
 * ⛔ Cột phải CHỈ dựng khi BE trả `media` — vắng thì biểu đồ trải hết bề ngang, không để cột trống giữ chỗ. Dưới `xl` lưới về MỘT cột (biểu đồ
 * trên, KPI dưới); khi đó KPI "Gọi & họp" cao theo nội dung vì không còn hàng nào để chia đều.
 */
const DashboardHero = memo(function DashboardHero({
  insights,
  insightsLoading,
  insightsStale,
  media,
  mediaLoading,
}: DashboardHeroProps) {
  const meetingPath = MODULE_BY_ID.meeting?.path ?? '/meeting';

  return (
    <div
      className={cn(
        'grid shrink-0 grid-cols-1 grid-rows-[minmax(22rem,auto)] gap-2',
        media && 'xl:grid-cols-[minmax(0,1fr)_22rem] wide:grid-cols-[minmax(0,1fr)_26rem]',
      )}
    >
      <ActivityTrendPanel insights={insights} loading={insightsLoading} stale={insightsStale} />
      {media && (
        <PanelCard frame="default" title="Gọi & họp" tone="sky">
          <OverviewMediaKpis
            liveMeetingsHref={`${meetingPath}?tab=meetings&status=LIVE`}
            loading={mediaLoading}
            media={media}
          />
        </PanelCard>
      )}
    </div>
  );
});

export default DashboardHero;
