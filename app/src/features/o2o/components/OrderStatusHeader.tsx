import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { IconTile } from '@/shared/ui/icon-tile';

import type { PrintOrderView } from '../api/o2o.types';
import { STATUS_HINT, STATUS_LABEL, STATUS_TONE, STATUS_VISUAL } from '../constants/o2o.constants';

/**
 * Trạng thái LỚN bằng chữ ("Chờ tiệm nhận", "Đang in", "Sẵn sàng nhận"…) + câu nói việc NÊN LÀM tiếp theo (app.md §3 "Vé đơn"). Đọc được từ xa, không cần
 * hiểu mã trạng thái. Lý do từ chối/huỷ (nếu có) hiện ngay dưới — người dùng cần biết vì sao đơn dừng. Cập nhật realtime qua `print-order:updated`.
 * Ô icon lớn cùng tông trạng thái (`STATUS_VISUAL`) đứng cạnh chữ — mốc nhìn từ xa, thuần trang trí (nghĩa nằm ở chữ).
 */
export function OrderStatusHeader({ order }: { order: PrintOrderView }) {
  const reason =
    order.status === 'REJECTED'
      ? order.rejectReason
      : order.status === 'CANCELLED'
        ? order.cancelReason
        : null;
  const visual = STATUS_VISUAL[order.status];

  return (
    <View accessibilityRole="header" className="gap-xs">
      <View className="flex-row flex-wrap items-center gap-xs">
        <Badge label={order.code} size="sm" variant="neutral" />
        <Badge label={STATUS_LABEL[order.status]} size="sm" variant={STATUS_TONE[order.status]} />
      </View>
      <View className="flex-row items-center gap-sm">
        <IconTile name={visual.icon} size="lg" tone={visual.tone} />
        <Text className="flex-1 text-header-lg font-semibold text-fg-1">
          {STATUS_LABEL[order.status]}
        </Text>
      </View>
      <Text className="text-body-lg text-fg-2">{STATUS_HINT[order.status]}</Text>
      {reason ? <Text className="text-body-md text-fg-1">Lý do: {reason}</Text> : null}
    </View>
  );
}
