import { lazy, memo, Suspense, useMemo } from 'react';
import type { ComponentType } from 'react';
import { useMatches } from 'react-router-dom';

import { useCapabilities } from '@/app/capabilities';
import type { RouteHandle } from '@/app/router/modules/types';
import { useQueryParams } from '@/shared/hooks';
import { EmptyState, PageBody, PageShell, Skeleton } from '@/shared/ui';
import { PageHeader, useQueryTabNav } from '@/shared/widgets/header';

import ErrorConnectionsTab from '../components/ErrorConnectionsTab';
import ProvidersTab from '../components/ProvidersTab';
import WebhookEventsTab from '../components/WebhookEventsTab';

/** Tab vận hành soạn thảo cộng tác (p6-01) — nạp lười để bảng/biểu đồ của nó không vào bundle khi chưa mở tab. */
const CollabOpsTab = lazy(() => import('@/features/collab-ops/components/CollabOpsTab'));

interface IntegrationTabDef {
  component: ComponentType;
  /** Cờ `capabilities.features` của tính năng mà tab thuộc về — cờ TẮT thì ẩn tab (phân hệ có nhiều cờ độc lập, xem `integration.routes.tsx`). */
  featureFlag: string;
}

const INTEGRATION_TABS: Record<string, IntegrationTabDef> = {
  events: { component: WebhookEventsTab, featureFlag: 'integration' },
  providers: { component: ProvidersTab, featureFlag: 'integration' },
  connections: { component: ErrorConnectionsTab, featureFlag: 'integration' },
  collab: { component: CollabOpsTab, featureFlag: 'collab' },
};

/** Nhãn rút gọn cho màn < 1024px / máy chạm — chip tab trên header không co được (`PageHeaderNavItem.shortLabel`). */
const SHORT_LABELS = { events: 'Webhook', collab: 'Cộng tác' } as const;

/**
 * Trang `/integration?tab=events|providers|connections|collab` (admin.md p5-03 §1, p6-01 §1) — khung tab URL-synced như `gamification`. Quyền xem
 * (`integration:view`) do registry chặn; quyền ghi (`integration:update`, `system-config:update`) kiểm ở từng tab. Phân hệ vào được khi BẤT KỲ cờ
 * `integration`/`collab` bật, nên MỖI TAB tự ẩn khi cờ riêng của nó tắt (chưa biết cờ — lỗi tải `/capabilities` — coi như bật, cùng quy ước `FeatureGate`).
 * Tiêu đề + dải tab nằm trên THANH HEADER (`<PageHeader nav>`), vùng nội dung chỉ còn nội dung tab.
 */
const IntegrationPage = memo(function IntegrationPage() {
  const matches = useMatches();
  const qp = useQueryParams();
  const { data: caps } = useCapabilities();
  const handle = useMemo(
    () => matches.map((m) => m.handle as RouteHandle | undefined).find((h) => h?.tabTitles),
    [matches],
  );
  const options = useMemo(
    () =>
      Object.entries(handle?.tabTitles ?? {})
        .filter(([key]) => {
          const def = INTEGRATION_TABS[key];
          return !!def && (!caps || Boolean(caps.features[def.featureFlag]?.enabled));
        })
        .map(([key, label]) => ({ key, label })),
    [handle, caps],
  );
  const requested = qp.tab || handle?.defaultTab || 'events';
  const active = options.some((o) => o.key === requested) ? requested : options[0]?.key;
  const Active = active ? INTEGRATION_TABS[active]?.component : undefined;
  const nav = useQueryTabNav({
    active: Active ? active : undefined,
    onSelect: qp.setTab,
    options,
    shortLabels: SHORT_LABELS,
  });

  return (
    <PageShell>
      <PageHeader nav={nav} title="Tích hợp" tone="azure" />
      <PageBody overflow="scroll">
        {!Active ? (
          <EmptyState description="Chưa có tab nào." title="Chưa có dữ liệu" />
        ) : (
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <Active />
          </Suspense>
        )}
      </PageBody>
    </PageShell>
  );
});

export default IntegrationPage;
