import { memo, useCallback, useMemo } from 'react';
import type { ComponentType } from 'react';
import { useMatches } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type { RouteHandle } from '@/app/router/modules/types';
import { useQueryParams } from '@/shared/hooks';
import { PageShell } from '@/shared/ui';
import { PageHeader, useQueryTabNav } from '@/shared/widgets/header';

import CompaniesTab from '../components/CompaniesTab';
import RecruiterReportsTab from '../components/RecruiterReportsTab';
import RecruiterStatsPanel from '../components/RecruiterStatsPanel';

const FALLBACK_TAB = 'companies';

/** Tab đã có màn hình. `reports` cần thêm `moderation:view` (dùng lại hàng đợi báo cáo của moderation). */
const OPS_TABS: Record<string, ComponentType> = {
  companies: CompaniesTab,
  stats: RecruiterStatsPanel,
  reports: RecruiterReportsTab,
};

/**
 * Khoá URL riêng của từng tab — đổi tab thì XOÁ hết: `status` của danh sách doanh nghiệp (`PENDING`…) và của báo cáo (`OPEN`…) là hai enum khác nhau,
 * `from/to` của thống kê không được rơi sang tab khác, và ngăn kéo `companyId` không nên mở lại khi quay về. Không xoá thì URL lạ bám theo người dùng.
 */
const TAB_SCOPED_KEYS = [
  'q',
  'status',
  'tier',
  'page',
  'pageSize',
  'companyId',
  'targetType',
  'from',
  'to',
] as const;

/**
 * Trang `/recruiter?tab=` — VẬN HÀNH tuyển dụng (admin.md p6-08 §2): `companies` Doanh nghiệp (duyệt / tạm ngưng / đổi gói) · `stats` Thống kê · `reports` Báo cáo
 * (lời mời/doanh nghiệp bị báo cáo). Danh sách tab = giao của `tabTitles` (đọc từ route `handle`) và `OPS_TABS`; `reports` ẩn khi thiếu `moderation:view`.
 * Tiêu đề + dải tab nằm trên THANH HEADER (`<PageHeader nav>`); chỉ một tab thì KHÔNG vẽ dải tab. Quyền vào (`recruiter:view`) và cờ `career` do registry
 * chặn. Khác `recruiter-portal` — cổng HR tự phục vụ.
 */
const RecruiterOpsPage = memo(function RecruiterOpsPage() {
  const matches = useMatches();
  const qp = useQueryParams();
  const { updateParams } = qp;
  const canViewReports = useAuthStore((s) => s.hasPermission('moderation', 'view'));

  const handle = useMemo(
    () => matches.map((m) => m.handle as RouteHandle | undefined).find((h) => h?.tabTitles),
    [matches],
  );

  const options = useMemo(() => {
    const listed = Object.entries(handle?.tabTitles ?? {})
      .filter(([key]) => key in OPS_TABS && (key !== 'reports' || canViewReports))
      .map(([key, label]) => ({ key, label }));
    // Registry chưa khai tab nào (test dựng trang trần) → vẫn có danh sách doanh nghiệp.
    return listed.length > 0 ? listed : [{ key: FALLBACK_TAB, label: 'Doanh nghiệp' }];
  }, [canViewReports, handle]);

  const requested = qp.tab || handle?.defaultTab || FALLBACK_TAB;
  const active = options.some((o) => o.key === requested) ? requested : options[0].key;
  const Active = OPS_TABS[active];

  const handleTabChange = useCallback(
    (key: string) =>
      updateParams({ ...Object.fromEntries(TAB_SCOPED_KEYS.map((k) => [k, null])), tab: key }),
    [updateParams],
  );
  const nav = useQueryTabNav({
    active,
    minItems: 2,
    onSelect: handleTabChange,
    options,
    resetKeys: TAB_SCOPED_KEYS,
  });

  return (
    <PageShell>
      <PageHeader nav={nav} title="Tuyển dụng" tone="pink" />
      <Active />
    </PageShell>
  );
});

export default RecruiterOpsPage;
