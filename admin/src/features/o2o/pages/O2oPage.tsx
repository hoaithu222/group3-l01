import { memo, useCallback, useMemo } from 'react';
import type { ComponentType } from 'react';
import { useMatches } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';
import { EmptyState, PageBody, PageShell } from '@/shared/ui';
import { useQueryParams } from '@/shared/hooks';
import { PageHeader, useQueryTabNav } from '@/shared/widgets/header';

import LocationsTab from '../components/locations/LocationsTab';
import OrdersTab from '../components/orders/OrdersTab';
import ShopsTab from '../components/shops/ShopsTab';
import { O2O_TAB_RESET_PARAMS } from '../constants/o2o.constants';

const O2O_TABS: Record<string, ComponentType> = {
  locations: LocationsTab,
  shops: ShopsTab,
  orders: OrdersTab,
};

/**
 * Trang `/o2o?tab=locations|shops|orders` (admin.md p6-05 §1) — vận hành mạng lưới địa điểm · tiệm in · đơn in, khung tab URL-synced
 * như `gamification`/`integration`. Quyền xem (`o2o:view`) và cờ `o2o` do registry chặn; quyền ghi kiểm ở từng tab/ngăn kéo. Đổi tab
 * XOÁ bộ lọc/trang/ngăn kéo của tab cũ (mỗi tab dùng chung một số khoá URL như `status`, `page`) để không rò sang tab mới.
 *
 * Tiêu đề + dải tab nằm trên THANH HEADER (`<PageHeader nav>`). `href` của chip cũng xoá đúng các khoá đó (`resetKeys`), nên mở
 * tab ở thẻ mới ra đúng màn mà cú bấm thường dựng.
 */
const O2oPage = memo(function O2oPage() {
  const matches = useMatches();
  const qp = useQueryParams();
  const { updateParams } = qp;

  const handle = useMemo(
    () => matches.map((m) => m.handle as RouteHandle | undefined).find((h) => h?.tabTitles),
    [matches],
  );
  const options = useMemo(
    () =>
      Object.entries(handle?.tabTitles ?? {})
        .filter(([key]) => key in O2O_TABS)
        .map(([key, label]) => ({ key, label })),
    [handle],
  );
  const requested = qp.tab || handle?.defaultTab || 'locations';
  const active = options.some((o) => o.key === requested) ? requested : options[0]?.key;
  const Active = active ? O2O_TABS[active] : undefined;

  const handleTabChange = useCallback(
    (key: string) =>
      updateParams({ ...Object.fromEntries(O2O_TAB_RESET_PARAMS.map((k) => [k, null])), tab: key }),
    [updateParams],
  );
  const nav = useQueryTabNav({
    active: Active ? active : undefined,
    onSelect: handleTabChange,
    options,
    resetKeys: O2O_TAB_RESET_PARAMS,
  });

  return (
    <PageShell>
      <PageHeader nav={nav} title="Địa điểm & in ấn" tone="lime" />
      <PageBody overflow="scroll">
        {!Active ? <EmptyState description="Chưa có tab nào." title="Chưa có dữ liệu" /> : <Active />}
      </PageBody>
    </PageShell>
  );
});

export default O2oPage;
