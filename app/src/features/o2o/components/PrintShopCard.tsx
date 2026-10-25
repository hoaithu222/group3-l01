import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';
import { formatCurrency } from '@/shared/utils/format/currency.utils';

import type { PrintShopView } from '../api/o2o.types';
import { O2O_TONE } from '../constants/o2o.constants';
import { pricePerPage } from '../utils/o2o-format';

export interface PrintShopCardProps {
  shop: PrintShopView;
  onOrder: () => void;
}

interface PriceLine {
  key: string;
  label: string;
  amount: number;
}

/** Chỉ liệt kê mức giá tiệm THẬT SỰ nhận (không hiện dòng "A3 màu" của tiệm không in A3/màu) — đúng năng lực, khỏi gây hiểu nhầm. */
function priceLines(shop: PrintShopView): PriceLine[] {
  const { capabilities: caps, priceTable: table } = shop;
  return [
    { key: 'a4bw', label: 'A4 đen trắng', amount: table.a4Bw },
    ...(caps.color ? [{ key: 'a4c', label: 'A4 màu', amount: table.a4Color }] : []),
    ...(caps.a3 ? [{ key: 'a3bw', label: 'A3 đen trắng', amount: table.a3Bw }] : []),
    ...(caps.a3 && caps.color ? [{ key: 'a3c', label: 'A3 màu', amount: table.a3Color }] : []),
  ];
}

/**
 * Khối tiệm in trong chi tiết địa điểm (app.md §3, README "Điểm mở": hiện đơn giá công khai): bảng giá tóm tắt, năng lực, điều kiện tối thiểu,
 * và "Đặt in" — CHỈ bấm được khi tiệm đang nhận đơn (`acceptingOrders`). Tiền là số nguyên đồng (BE) → `formatCurrency`.
 */
export function PrintShopCard({ shop, onOrder }: PrintShopCardProps) {
  const { capabilities: caps, priceTable: table } = shop;
  const accepting = shop.acceptingOrders;

  return (
    <Section icon="store-location" title="Đặt in tại đây">
      <Card>
        <View className="flex-row items-center gap-sm pb-xs">
          <IconTile name="document-2" size="sm" tone={O2O_TONE} />
          <Text className="flex-1 text-label-lg font-semibold text-fg-1">{shop.displayName}</Text>
          <Badge
            label={accepting ? 'Đang nhận đơn' : 'Tạm ngưng nhận đơn'}
            size="sm"
            variant={accepting ? 'success' : 'neutral'}
          />
        </View>
        {priceLines(shop).map((line) => (
          <ListItem key={line.key} divider label={line.label} value={pricePerPage(line.amount)} />
        ))}
        {caps.duplex && table.duplexDiscountPct > 0 ? (
          <ListItem divider label="In hai mặt" value={`Giảm ${table.duplexDiscountPct}%`} />
        ) : null}
        <ListItem
          label="Đơn tối thiểu"
          value={formatCurrency(table.minOrder)}
          valueDescription="Thanh toán tại quầy khi nhận tài liệu"
        />
        <View className="flex-row flex-wrap gap-2xs pt-xs">
          <Badge label={caps.color ? 'In màu' : 'Chỉ đen trắng'} size="sm" variant="neutral" />
          {caps.duplex ? <Badge label="In hai mặt" size="sm" variant="neutral" /> : null}
          {caps.a3 ? <Badge label="Khổ A3" size="sm" variant="neutral" /> : null}
          {caps.binding ? <Badge label="Đóng gáy" size="sm" variant="neutral" /> : null}
        </View>
        {shop.phone ? (
          <Text className="pt-xs text-body-md text-fg-2">Điện thoại: {shop.phone}</Text>
        ) : null}
        <View className="pt-sm">
          <Button
            disabled={!accepting}
            fullWidth
            iconLeft="document-2"
            label={accepting ? 'Đặt in' : 'Tiệm tạm ngưng nhận đơn'}
            onPress={onOrder}
          />
        </View>
      </Card>
    </Section>
  );
}
