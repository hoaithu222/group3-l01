import { memo, useMemo } from 'react';
import { useMatches } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';
import { EmptyState, PageBody, PageShell } from '@/shared/ui';
import { useQueryParams } from '@/shared/hooks';
import { PageHeader, useQueryTabNav } from '@/shared/widgets/header';

import PartnerAccountTab from '../components/PartnerAccountTab';
import PartnerPricesTab from '../components/PartnerPricesTab';
import PartnerQueueTab from '../components/PartnerQueueTab';
import { usePartnerAlerts } from '../hooks/usePartnerAlerts';

/**
 * Trang `/partner?tab=queue|prices|account` — cổng TỰ PHỤC VỤ của chủ tiệm in (admin.md p6-05 §1, §2.4; audience `partner`, quyền
 * `partner:view` cấp theo dữ liệu: chỉ chủ tiệm ĐÃ DUYỆT). Khung tab URL-synced như `gamification`. `usePartnerAlerts` gắn ở đây để
 * đơn mới báo được cả khi đang ở tab Bảng giá/Tài khoản; hai tab ghi (Đơn hàng, Tài khoản) cần `partner:update` ở BE.
 *
 * Tiêu đề + dải tab nằm trên THANH HEADER (`<PageHeader nav>` — chip hai bên bảng tên), vùng nội dung chỉ còn nội dung tab.
 */
const PartnerPage = memo(function PartnerPage() {
  const matches = useMatches();
  const qp = useQueryParams();
  const { soundOn, setSoundOn } = usePartnerAlerts();

  const handle = useMemo(
    () => matches.map((m) => m.handle as RouteHandle | undefined).find((h) => h?.tabTitles),
    [matches],
  );
  const options = useMemo(
    () => Object.entries(handle?.tabTitles ?? {}).map(([key, label]) => ({ key, label })),
    [handle],
  );
  const requested = qp.tab || handle?.defaultTab || 'queue';
  const active = options.some((o) => o.key === requested) ? requested : options[0]?.key;
  const nav = useQueryTabNav({ active, onSelect: qp.setTab, options });

  return (
    <PageShell>
      <PageHeader nav={nav} title="Tiệm in" tone="orange" />
      <PageBody overflow="scroll">
        {!active ? (
          <EmptyState description="Chưa có tab nào." title="Chưa có dữ liệu" />
        ) : (
          <>
            {active === 'queue' ? <PartnerQueueTab /> : null}
            {active === 'prices' ? <PartnerPricesTab /> : null}
            {active === 'account' ? (
              <PartnerAccountTab soundOn={soundOn} onSoundChange={setSoundOn} />
            ) : null}
          </>
        )}
      </PageBody>
    </PageShell>
  );
});

export default PartnerPage;
