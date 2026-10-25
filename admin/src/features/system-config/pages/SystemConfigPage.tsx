import { memo, Suspense, useMemo } from 'react';
import { useMatches } from 'react-router-dom';

import { FeatureGate } from '@/app/router/modules/FeatureGate';
import type { RouteHandle } from '@/app/router/modules/types';
import { EmptyState, PageBody, PageShell, Skeleton, Tabs } from '@/shared/ui';
import { useQueryParams } from '@/shared/hooks';
import { PageHeader } from '@/shared/widgets/header';

import { SYSTEM_CONFIG_TABS } from '../tabs/tab-registry';

const FALLBACK_TAB = 'limits';

/**
 * Trang `system-config` — khung tab URL-synced (`?tab=`) (admin.md p0-07 §2.1).
 *
 * Danh sách tab = giao của `tabTitles` (đọc từ route `handle`, KHÔNG import
 * `module-registry.ts` — xem `RouteHandle`) và `SYSTEM_CONFIG_TABS`. Quyền xem
 * do `PermissionGuard system-config:view` của route lo; quyền sửa kiểm ở từng
 * tab.
 */
const SystemConfigPage = memo(function SystemConfigPage() {
  const matches = useMatches();
  const qp = useQueryParams();

  const handle = useMemo(
    () => matches.map((m) => m.handle as RouteHandle | undefined).find((h) => h?.tabTitles),
    [matches],
  );

  const options = useMemo(
    () =>
      Object.entries(handle?.tabTitles ?? {})
        .filter(([key]) => key in SYSTEM_CONFIG_TABS)
        .map(([key, label]) => ({ key, label })),
    [handle],
  );

  const requested = qp.tab || handle?.defaultTab || FALLBACK_TAB;
  // Tab trên URL không tồn tại (gõ tay, hoặc tab chưa có component) → tab đầu tiên.
  const active = options.some((o) => o.key === requested) ? requested : options[0]?.key;
  const def = active ? SYSTEM_CONFIG_TABS[active] : undefined;

  const body = def ? (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <def.component />
    </Suspense>
  ) : null;

  return (
    <PageShell>
      {/* Tiêu đề lên THANH HEADER. Dải tab (tới 9 nhóm cấu hình) vẫn ở vùng nội dung — quá dài để
          ghim quanh bảng tên canh giữa. */}
      <PageHeader title="Cấu hình hệ thống" tone="sky" />
      <PageBody overflow="scroll">
        {options.length === 0 || !def ? (
          <EmptyState description="Chưa có tab cấu hình nào." title="Chưa có cấu hình" />
        ) : (
          <>
            <Tabs
              aria-label="Nhóm cấu hình hệ thống"
              options={options}
              size="sm"
              value={active}
              onValueChange={qp.setTab}
            />
            <div className="mt-3">
              {def.featureFlag ? <FeatureGate flag={def.featureFlag}>{body}</FeatureGate> : body}
            </div>
          </>
        )}
      </PageBody>
    </PageShell>
  );
});

export default SystemConfigPage;
