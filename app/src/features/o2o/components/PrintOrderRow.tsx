import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatCurrency } from '@/shared/utils/format/currency.utils';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { PrintOrderView } from '../api/o2o.types';
import { STATUS_LABEL, STATUS_TONE, STATUS_VISUAL } from '../constants/o2o.constants';

/**
 * Một đơn trong "Đơn của tôi" (app.md §3): ô icon trạng thái, mã, trạng thái (chữ), tiệm, tên tệp, tổng tiền, thời điểm gửi (đơn nháp: thời
 * điểm tạo). Trạng thái là CHỮ trên huy hiệu — ô icon và màu chỉ bổ trợ (nhìn lướt danh sách là thấy đơn nào "Sẵn sàng nhận").
 * Nhãn trợ năng gộp cả dòng thành một câu; ô icon thuần trang trí nên không có nhãn riêng.
 */
export function PrintOrderRow({ order, onPress }: { order: PrintOrderView; onPress: () => void }) {
  const shopName = order.shop?.displayName ?? 'Tiệm in';
  const when = formatDateTime(order.submittedAt ?? order.createdAt);
  const total = order.quote ? formatCurrency(order.quote.total) : null;
  const visual = STATUS_VISUAL[order.status];
  const spoken = [order.code, STATUS_LABEL[order.status], shopName, order.fileName, total, when]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable accessibilityLabel={spoken} accessibilityRole="button" onPress={onPress}>
      {({ pressed }) => (
        <View
          className={
            pressed
              ? 'flex-row items-center gap-sm rounded-md border-hairline border-border-1 bg-bg-2 p-md'
              : 'flex-row items-center gap-sm rounded-md border-hairline border-border-1 bg-bg-1 p-md'
          }
        >
          <IconTile name={visual.icon} tone={visual.tone} />
          <View className="flex-1 gap-2xs">
            <View className="flex-row flex-wrap items-center gap-xs">
              <Text className="text-label-lg font-semibold text-fg-1">{order.code}</Text>
              <Badge
                label={STATUS_LABEL[order.status]}
                size="sm"
                variant={STATUS_TONE[order.status]}
              />
            </View>
            <Text className="text-body-md text-fg-1" numberOfLines={1}>
              {shopName}
            </Text>
            <Text className="text-body-md text-fg-2" numberOfLines={1}>
              {order.fileName}
            </Text>
            <Text className="text-caption-lg text-fg-2">
              {total ? `${total} · ` : ''}
              {when}
            </Text>
          </View>
          <Icon color="fg-2" name="arrow-right-small" size="sm" />
        </View>
      )}
    </Pressable>
  );
}
