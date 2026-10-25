import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatCurrency } from '@/shared/utils/format/currency.utils';

import type { PrintQuote } from '../api/o2o.types';
import { pricePerPage } from '../utils/o2o-format';

export interface QuoteSummaryProps {
  quote: PrintQuote | undefined;
  copies: number;
  /** Đang tính lại theo cấu hình mới — số cũ còn đó nhưng KHÔNG được coi là chốt (nút gửi khoá ở màn cha). */
  busy: boolean;
  /** Chưa biết số trang (job đếm còn chạy) nên chưa có gì để báo giá. */
  waitingForPages: boolean;
  /** Lỗi cấu hình (`O2O_002`): tiệm không hỗ trợ — hiện thay cho bảng giá. */
  error: string | null;
}

/**
 * Báo giá (app.md §3 `QuoteSummary`) — mọi con số lấy từ RESPONSE của server (`POST /print-shops/:id/quote`), app KHÔNG tự tính tiền: bảng giá có thể
 * đổi và công thức (làm tròn, giảm hai mặt, đơn tối thiểu) là của BE. Tiền là số nguyên đồng. "Thanh toán tại quầy" (D-11, P0): trả khi nhận tài liệu.
 */
export function QuoteSummary({ quote, copies, busy, waitingForPages, error }: QuoteSummaryProps) {
  if (error) {
    return (
      <Section icon="bill" title="Báo giá">
        <Alert description={error} tone="warning" />
      </Section>
    );
  }

  if (waitingForPages || !quote) {
    return (
      <Section icon="bill" title="Báo giá">
        <Card>
          {waitingForPages ? (
            <Text className="text-body-md text-fg-2">
              Sẽ có báo giá ngay khi đếm xong số trang.
            </Text>
          ) : (
            <Skeleton className="h-24 rounded-md" />
          )}
        </Card>
      </Section>
    );
  }

  const raisedToMinimum = quote.total > quote.subtotal - quote.duplexDiscount;

  return (
    <Section icon="bill" title="Báo giá">
      <View accessibilityState={{ busy }} className={busy ? 'opacity-60' : undefined}>
        <Card>
          <ListItem
            divider
            label="Số trang in"
            value={`${quote.printablePages} trang × ${copies} bản`}
          />
          <ListItem divider label="Đơn giá" value={pricePerPage(quote.unitPrice)} />
          <ListItem divider label="Tạm tính" value={formatCurrency(quote.subtotal)} />
          {quote.duplexDiscount > 0 ? (
            <ListItem
              divider
              label="Giảm giá in hai mặt"
              value={`-${formatCurrency(quote.duplexDiscount)}`}
            />
          ) : null}
          {raisedToMinimum ? <ListItem divider label="Áp dụng đơn tối thiểu của tiệm" /> : null}
          <Divider />
          <View className="flex-row items-center justify-between gap-sm pt-sm">
            <Text className="flex-1 text-label-lg font-semibold text-fg-1">Tổng cộng</Text>
            <Text className="text-header-sm font-semibold text-fg-brand">
              {formatCurrency(quote.total)}
            </Text>
          </View>
          <Text className="pt-2xs text-body-md text-fg-2">
            Thanh toán tại quầy khi nhận tài liệu.
          </Text>
        </Card>
      </View>
    </Section>
  );
}
