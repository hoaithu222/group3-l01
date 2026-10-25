import { memo } from 'react';

import {
  Fact,
  formatPagesTimesCopies,
  formatPrintSettings,
  OrderQuoteView,
  OrderTimeline,
  PRINT_ORDER_STATUS_META,
  PRINT_PAYMENT_METHOD_LABELS,
  PRINT_PAYMENT_META,
  StatusBadge,
} from '@/features/o2o';
import { CopyableText, Divider, Text } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import type { PartnerOrder } from '../types/partner.types';
import OrderActions from './OrderActions';

const when = (iso: string | null) => (iso ? formatDate(iso, 'HH:mm:ss DD/MM/YYYY') : '—');

export interface PartnerOrderDetailProps {
  order: PartnerOrder;
}

/**
 * Chi tiết đơn của chủ tiệm (`/partner/orders/:id`, admin.md p6-05 §2.4): mã (chép được) · trạng thái · thanh toán · nút hành động
 * (như hàng đợi, thêm "Đã thu tiền") · khách (TÊN) · tên tệp · cấu hình in · mốc thời gian · lý do từ chối/huỷ · báo giá snapshot ·
 * dòng thời gian. Không PIN; URL tệp chỉ lấy khi bấm "Tải tệp" (ACCEPTED/PRINTING).
 */
const PartnerOrderDetail = memo(function PartnerOrderDetail({ order }: PartnerOrderDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <CopyableText display={order.code} label="mã đơn" value={order.code} />
        <StatusBadge fallback={order.status} meta={PRINT_ORDER_STATUS_META[order.status]} />
        <StatusBadge
          fallback={order.payment.status}
          meta={PRINT_PAYMENT_META[order.payment.status]}
        />
      </div>
      <OrderActions order={order} size="sm" withMarkPaid />
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Fact label="Khách">{order.customer.name}</Fact>
        <Fact label="Tệp">{order.fileName}</Fact>
        <Fact label="Số trang">
          <span className="tabular-nums">{formatPagesTimesCopies(order)}</span>
        </Fact>
        <Fact label="Cấu hình in">{formatPrintSettings(order.settings)}</Fact>
        <Fact label="Thanh toán">{PRINT_PAYMENT_METHOD_LABELS[order.payment.method]}</Fact>
        <Fact label="Thu tiền lúc">{when(order.payment.confirmedAt)}</Fact>
        <Fact label="Hẹn lấy">{when(order.pickupBy)}</Fact>
        <Fact label="Gửi lúc">{when(order.submittedAt)}</Fact>
        <Fact label="Sẵn sàng lúc">{when(order.readyAt)}</Fact>
        <Fact label="Giao lúc">{when(order.pickedUpAt)}</Fact>
        {order.rejectReason ? <Fact label="Lý do từ chối">{order.rejectReason}</Fact> : null}
        {order.cancelReason ? <Fact label="Lý do huỷ">{order.cancelReason}</Fact> : null}
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
      <OrderTimeline events={order.events} />
    </div>
  );
});

export default PartnerOrderDetail;
