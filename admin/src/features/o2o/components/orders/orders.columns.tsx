import { Link } from 'react-router-dom';

import type { TableColumn } from '@/shared/ui';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';
import { formatCurrency, formatDate } from '@/shared/utils/format';

import { PRINT_ORDER_STATUS_META, PRINT_PAYMENT_META } from '../../constants/print.constants';
import type { AdminOrder } from '../../types/o2o.types';
import { formatPagesTimesCopies } from '../../utils/print.utils';
import StatusBadge from '../shared/StatusBadge';

export interface OrderColumnsOptions {
  /** URL THẬT mở ngăn kéo đơn (giữ bộ lọc) — Ctrl+click mở tab mới được. */
  hrefFor: (order: AdminOrder) => string;
  onOpen: (order: AdminOrder) => void;
}

const when = (iso: string | null) => (iso ? formatDate(iso, 'HH:mm DD/MM/YYYY') : '—');

/**
 * Cột bảng "Đơn in" (admin.md p6-05 §2.3): mã đơn (liên kết mở ngăn kéo) · khách (TÊN — không email) · tiệm · trang × bản · tổng ·
 * trạng thái · thanh toán · gửi lúc · sẵn sàng lúc. KHÔNG có cột PIN hay tệp (viewpoint riêng tư).
 */
export function buildOrderColumns({
  hrefFor,
  onOpen,
}: OrderColumnsOptions): TableColumn<AdminOrder>[] {
  return [
    {
      key: 'code',
      header: 'Mã đơn',
      width: 120,
      cell: (o) => (
        <Link
          className="font-mono text-body-14 text-link hover:underline"
          to={hrefFor(o)}
          onClick={(ev) => {
            if (isModifiedClick(ev)) return;
            ev.preventDefault();
            onOpen(o);
          }}
        >
          {o.code}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Khách',
      width: 160,
      cell: (o) => <span className="block truncate">{o.customer.name}</span>,
    },
    {
      key: 'shop',
      header: 'Tiệm',
      width: 180,
      cell: (o) =>
        o.shop ? (
          <span className="block truncate">{o.shop.displayName}</span>
        ) : (
          <span className="text-fg-4">—</span>
        ),
    },
    {
      key: 'pages',
      header: 'Trang × bản',
      width: 140,
      cell: (o) => <span className="tabular-nums">{formatPagesTimesCopies(o)}</span>,
    },
    {
      key: 'total',
      header: 'Tổng',
      width: 110,
      align: 'right',
      cell: (o) => (
        <span className="tabular-nums">{o.quote ? formatCurrency(o.quote.total) : '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 130,
      cell: (o) => <StatusBadge fallback={o.status} meta={PRINT_ORDER_STATUS_META[o.status]} />,
    },
    {
      key: 'payment',
      header: 'Thanh toán',
      width: 130,
      cell: (o) => (
        <StatusBadge fallback={o.payment.status} meta={PRINT_PAYMENT_META[o.payment.status]} />
      ),
    },
    {
      key: 'submittedAt',
      header: 'Gửi lúc',
      width: 130,
      cell: (o) => <span className="tabular-nums text-caption-12">{when(o.submittedAt)}</span>,
    },
    {
      key: 'readyAt',
      header: 'Sẵn sàng lúc',
      width: 130,
      cell: (o) => <span className="tabular-nums text-caption-12">{when(o.readyAt)}</span>,
    },
  ];
}
