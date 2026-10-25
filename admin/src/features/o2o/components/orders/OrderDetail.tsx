import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { Button, Callout, CopyableText, Divider, Text } from '@/shared/ui';
import { useDisclosure } from '@/shared/hooks';
import { formatDate } from '@/shared/utils/format';

import {
  PRINT_ORDER_STATUS_META,
  PRINT_PAYMENT_METHOD_LABELS,
  PRINT_PAYMENT_META,
} from '../../constants/print.constants';
import type { AdminOrder } from '../../types/o2o.types';
import { formatPagesTimesCopies, formatPrintSettings } from '../../utils/print.utils';
import Fact from '../shared/Fact';
import OrderQuoteView from '../shared/OrderQuoteView';
import OrderTimeline from '../shared/OrderTimeline';
import StatusBadge from '../shared/StatusBadge';
import CancelOrderModal from './CancelOrderModal';

const when = (iso: string | null) => (iso ? formatDate(iso, 'HH:mm:ss DD/MM/YYYY') : '—');

export interface OrderDetailProps {
  order: AdminOrder;
}

/**
 * Nội dung ngăn kéo đơn in (admin.md p6-05 §2.3): mã (chép được) + trạng thái, khách (TÊN), tiệm (liên kết sang tab Tiệm in), tệp
 * (chỉ TÊN), cấu hình in, báo giá snapshot, thanh toán, mốc thời gian, lý do từ chối/huỷ, dòng thời gian. **Không** PIN, **không** nút
 * tải tệp — vận hành chỉ theo dõi và huỷ khi khiếu nại (`o2o:update` VÀ BE cho phép `adminActions.canCancel`).
 */
const OrderDetail = memo(function OrderDetail({ order }: OrderDetailProps) {
  const canUpdate = useAuthStore((s) => s.hasPermission('o2o', 'update'));
  const cancel = useDisclosure();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CopyableText display={order.code} label="mã đơn" value={order.code} />
          <StatusBadge fallback={order.status} meta={PRINT_ORDER_STATUS_META[order.status]} />
        </div>
        {canUpdate && order.adminActions.canCancel ? (
          <Button size="sm" skin="danger" variant="stroke" onClick={cancel.open}>
            Huỷ đơn
          </Button>
        ) : null}
      </div>
      <Callout
        description="Trang quản trị không hiển thị mã PIN nhận hàng và không cho tải tệp in của khách."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />
      <dl className="grid grid-cols-2 gap-3">
        <Fact label="Khách">{order.customer.name}</Fact>
        <Fact label="Tiệm">
          {order.shop ? (
            <Link
              className="text-link hover:underline"
              to={{ search: `?tab=shops&shopId=${order.shop.id}` }}
            >
              {order.shop.displayName}
            </Link>
          ) : (
            <span className="text-fg-4">—</span>
          )}
        </Fact>
        <Fact label="Tệp">{order.fileName}</Fact>
        <Fact label="Số trang">
          <span className="tabular-nums">{formatPagesTimesCopies(order)}</span>
        </Fact>
        <Fact label="Cấu hình in" wide>
          {formatPrintSettings(order.settings)}
        </Fact>
        <Fact label="Thanh toán">
          <StatusBadge
            fallback={order.payment.status}
            meta={PRINT_PAYMENT_META[order.payment.status]}
          />{' '}
          <span className="text-caption-12 text-fg-4">
            {PRINT_PAYMENT_METHOD_LABELS[order.payment.method]}
          </span>
        </Fact>
        <Fact label="Thu tiền lúc">{when(order.payment.confirmedAt)}</Fact>
        <Fact label="Hẹn lấy">{when(order.pickupBy)}</Fact>
        <Fact label="Gửi lúc">{when(order.submittedAt)}</Fact>
        <Fact label="Sẵn sàng lúc">{when(order.readyAt)}</Fact>
        <Fact label="Giao lúc">{when(order.pickedUpAt)}</Fact>
        {order.rejectReason ? (
          <Fact label="Lý do từ chối" wide>
            {order.rejectReason}
          </Fact>
        ) : null}
        {order.cancelReason ? (
          <Fact label="Lý do huỷ" wide>
            {order.cancelReason}
          </Fact>
        ) : null}
      </dl>
      <Divider />
      <Text size="small" weight="medium">
        Báo giá (lúc khách gửi)
      </Text>
      <OrderQuoteView quote={order.quote} />
      <Divider />
      <Text size="small" weight="medium">
        Dòng thời gian
      </Text>
      <OrderTimeline customerId={order.customer.id} events={order.events} />
      <CancelOrderModal open={cancel.isOpen} order={order} onClose={cancel.close} />
    </div>
  );
});

export default OrderDetail;
