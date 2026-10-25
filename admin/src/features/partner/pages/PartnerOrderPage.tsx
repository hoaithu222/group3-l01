import { isAxiosError } from 'axios';
import { memo } from 'react';
import { useMatches, useNavigate, useParams } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';
import { ListLoadError } from '@/features/o2o';
import { EmptyState, PageBody, PageShell, Skeleton } from '@/shared/ui';
import { PageHeader } from '@/shared/widgets/header';

import PartnerOrderDetail from '../components/PartnerOrderDetail';
import { usePartnerAlerts } from '../hooks/usePartnerAlerts';
import { usePartnerOrder } from '../service/partner.queries';

const FALLBACK_MODULE_PATH = '/partner';

/** Đường dẫn phân hệ qua `useMatches()` — KHÔNG import registry (khép vòng `check:cycles`, xem `RouteHandle`). */
function findModulePath(matches: ReturnType<typeof useMatches>): string {
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const modulePath = (matches[i].handle as RouteHandle | undefined)?.modulePath;
    if (modulePath) return modulePath;
  }
  return FALLBACK_MODULE_PATH;
}

/**
 * `/partner/orders/:id` (admin.md p6-05 §1, §2.4): chi tiết + dòng thời gian của MỘT đơn, cùng hành động như hàng đợi. Đơn của tiệm
 * khác hoặc không tồn tại → BE 404 trung tính → "Không tìm thấy đơn" (không phân biệt hai trường hợp, IR-13); lỗi mạng/5xx thì
 * có "Thử lại" (thử lại vẫn 404 thì vô ích nên KHÔNG hiện nút ở nhánh 404).
 */
const PartnerOrderPage = memo(function PartnerOrderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Đang xem chi tiết một đơn vẫn phải báo đơn MỚI của tiệm (âm báo/toast/tiêu đề tab) — như ở trang hàng đợi.
  usePartnerAlerts();
  const modulePath = findModulePath(useMatches());
  const queuePath = `${modulePath}?tab=queue`;
  const { data: order, isPending, isError, error, refetch } = usePartnerOrder(id);
  const notFound = isAxiosError(error) && error.response?.status === 404;

  let body;
  if (order) {
    body = <PartnerOrderDetail order={order} />;
  } else if (isError && !notFound) {
    body = (
      <ListLoadError error={error} title="Không tải được đơn" onRetry={() => void refetch()} />
    );
  } else if (isPending && !isError) {
    body = <Skeleton className="h-40 w-full" />;
  } else {
    body = (
      <EmptyState
        description="Đơn không tồn tại hoặc không thuộc tiệm của bạn."
        title="Không tìm thấy đơn"
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        backHref={queuePath}
        backLabel="Về hàng đợi đơn"
        title={order ? `Đơn ${order.code}` : 'Chi tiết đơn'}
        titleSize="sm"
        tone="orange"
        onBack={() => void navigate(queuePath)}
      />
      <PageBody overflow="scroll">{body}</PageBody>
    </PageShell>
  );
});

export default PartnerOrderPage;
