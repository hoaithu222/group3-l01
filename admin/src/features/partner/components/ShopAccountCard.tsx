import { memo } from 'react';

import { Fact, SHOP_STATUS_META, StatusBadge } from '@/features/o2o';
import { Callout, Heading, Surface, Text, Toggle } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import { usePartnerAccepting } from '../service/partner.queries';
import type { PartnerShop } from '../types/partner.types';

export interface ShopAccountCardProps {
  shop: PartnerShop;
}

/**
 * Thẻ tài khoản của MỘT tiệm (admin.md p6-05 §2.4): tên · địa chỉ · điện thoại · trạng thái duyệt (kèm lý do tạm ngưng) và công tắc
 * **Nhận đơn** (`POST /partner/shops/:id/accepting`, cần `partner:update`). Tắt nhận đơn → khách không đặt được đơn MỚI; đơn đang xử lý
 * không đổi. Công tắc chỉ dùng được khi tiệm đã duyệt (BE chỉ tiệm APPROVED mới có quyền `partner:*`); khi đang gửi bị khoá chống bấm đúp.
 */
const ShopAccountCard = memo(function ShopAccountCard({ shop }: ShopAccountCardProps) {
  const accepting = usePartnerAccepting();
  const approved = shop.status === 'APPROVED';

  return (
    <Surface className="flex flex-col gap-3" padding="lg" rounded>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading size="small">{shop.displayName}</Heading>
          {shop.location ? (
            <Text size="small" skin="muted">
              {shop.location.name} · {shop.location.address}
            </Text>
          ) : null}
        </div>
        <StatusBadge fallback={shop.status} meta={SHOP_STATUS_META[shop.status]} />
      </div>
      {shop.status === 'SUSPENDED' && shop.suspendedReason ? (
        <Callout description={shop.suspendedReason} intent="error" title="Tiệm đang tạm ngưng" />
      ) : null}
      <dl className="grid grid-cols-2 gap-3">
        <Fact label="Điện thoại">{shop.phone ?? '—'}</Fact>
        <Fact label="Duyệt lúc">
          <span className="tabular-nums">
            {shop.approvedAt ? formatDate(shop.approvedAt, 'HH:mm DD/MM/YYYY') : '—'}
          </span>
        </Fact>
      </dl>
      <Toggle
        checked={shop.acceptingOrders}
        disabled={!approved || accepting.isPending}
        label={shop.acceptingOrders ? 'Đang nhận đơn mới' : 'Đang tắt nhận đơn'}
        onCheckedChange={(next) => accepting.mutate({ id: shop.id, acceptingOrders: next })}
      />
    </Surface>
  );
});

export default ShopAccountCard;
