import { memo } from 'react';

import { formatCurrency, formatDate, formatNumber } from '@/shared/utils/format';

import type { PrintQuote } from '../../types/print.types';
import Fact from './Fact';

export interface OrderQuoteViewProps {
  quote: PrintQuote | null;
}

/**
 * Báo giá SNAPSHOT của đơn: số trang in · số tờ · đơn giá · tạm tính · giảm 2 mặt · TỔNG. Là con số lúc khách gửi — tiệm đổi bảng
 * giá sau đó không làm đổi (IR-15). Chưa có (đơn nháp / tệp lỗi) hiện "Chưa có báo giá".
 */
const OrderQuoteView = memo(function OrderQuoteView({ quote }: OrderQuoteViewProps) {
  if (!quote) return <p className="text-body-14 text-fg-4">Chưa có báo giá.</p>;
  return (
    <dl className="grid grid-cols-2 gap-3">
      <Fact label="Số trang in">
        <span className="tabular-nums">{formatNumber(quote.printablePages)}</span>
      </Fact>
      <Fact label="Số tờ (một bản)">
        <span className="tabular-nums">{formatNumber(quote.sheets)}</span>
      </Fact>
      <Fact label="Đơn giá (mỗi trang)">
        <span className="tabular-nums">{formatCurrency(quote.unitPrice)}</span>
      </Fact>
      <Fact label="Tạm tính">
        <span className="tabular-nums">{formatCurrency(quote.subtotal)}</span>
      </Fact>
      <Fact label="Giảm in 2 mặt">
        <span className="tabular-nums">
          {quote.duplexDiscount > 0 ? `− ${formatCurrency(quote.duplexDiscount)}` : '—'}
        </span>
      </Fact>
      <Fact label="Tổng cộng">
        <span className="tabular-nums text-body-16-semibold">{formatCurrency(quote.total)}</span>
      </Fact>
      <Fact label="Báo giá lúc" wide>
        <span className="tabular-nums">{formatDate(quote.quotedAt, 'HH:mm DD/MM/YYYY')}</span>
      </Fact>
    </dl>
  );
});

export default OrderQuoteView;
