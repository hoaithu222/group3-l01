import { memo } from 'react';

import { ListLoadError, PriceTableView } from '@/features/o2o';
import { Callout, EmptyState, Heading, Skeleton, Surface, Text } from '@/shared/ui';

import { usePartnerShops } from '../service/partner.queries';

/**
 * Tab "Bảng giá" (admin.md p6-05 §2.4): bảng giá + năng lực của từng tiệm, CHỈ ĐỌC — P0 chỉ vận hành đổi giá ("Liên hệ vận hành để
 * thay đổi"). Đơn khách ĐÃ GỬI giữ báo giá cũ nên đổi giá không ảnh hưởng đơn đang xử lý.
 */
const PartnerPricesTab = memo(function PartnerPricesTab() {
  const { data: shops, error, isPending, isError, refetch } = usePartnerShops();

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (isError && !shops) {
    return (
      <ListLoadError error={error} title="Không tải được bảng giá" onRetry={() => void refetch()} />
    );
  }
  if (!shops || shops.length === 0) {
    return (
      <EmptyState
        description="Tài khoản của bạn chưa gắn với tiệm in nào."
        title="Chưa có tiệm in"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Bảng giá do vận hành thiết lập. Liên hệ vận hành để thay đổi."
        intent="info"
        variant="ghost"
      />
      {shops.map((s) => (
        <Surface key={s.id} className="flex flex-col gap-3" padding="lg" rounded>
          <div>
            <Heading size="small">{s.displayName}</Heading>
            {s.location ? (
              <Text size="small" skin="muted">
                {s.location.address}
              </Text>
            ) : null}
          </div>
          <PriceTableView capabilities={s.capabilities} priceTable={s.priceTable} />
        </Surface>
      ))}
    </div>
  );
});

export default PartnerPricesTab;
