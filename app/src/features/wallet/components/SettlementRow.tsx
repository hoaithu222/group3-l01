import { Text, View } from 'react-native';

import { Badge, type BadgeProps } from '@/shared/ui/badge';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { SettlementStatus, SettlementView } from '../api';
import {
  SETTLEMENT_METHOD_ICON,
  SETTLEMENT_METHOD_LABEL,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_TONE,
} from '../constants/wallet.constants';
import { formatMoney } from '../domain/money';

export interface SettlementRowProps {
  meId: string | undefined;
  nameOf: (userId: string) => string;
  settlement: SettlementView;
}

/** Trạng thái = màu + CHỮ (huy hiệu luôn mang nhãn), không chỉ màu. */
const STATUS_VARIANT: Record<SettlementStatus, NonNullable<BadgeProps['variant']>> = {
  CANCELLED: 'neutral',
  CONFIRMED: 'success',
  PENDING: 'warning',
  REJECTED: 'error',
};

/**
 * Một dòng trong lịch sử thanh toán: ai → ai, số tiền, phương thức, trạng thái, lý do từ chối.
 * Ô icon nói "trả bằng gì" (ngân hàng · tiền mặt · khác), tông theo trạng thái — cùng cặp màu với huy hiệu bên phải, chỉ bổ trợ chữ.
 */
export function SettlementRow({ meId, nameOf, settlement }: SettlementRowProps) {
  const from = settlement.fromId === meId ? 'Bạn' : nameOf(settlement.fromId);
  const to = settlement.toId === meId ? 'bạn' : nameOf(settlement.toId);
  const status = SETTLEMENT_STATUS_LABEL[settlement.status];
  const meta = `${SETTLEMENT_METHOD_LABEL[settlement.method]} · ${formatDateTime(settlement.createdAt)}`;

  return (
    <View
      accessibilityLabel={`${from} trả ${to} ${formatMoney(settlement.amount)}. ${status}. ${meta}`}
      accessible
      className="min-h-14 flex-row items-center gap-sm py-xs"
    >
      <IconTile
        name={SETTLEMENT_METHOD_ICON[settlement.method]}
        size="sm"
        tone={SETTLEMENT_STATUS_TONE[settlement.status]}
      />
      <View className="flex-1 gap-3xs">
        <Text className="text-body-lg font-semibold text-fg-1" numberOfLines={1}>
          {from} → {to}
        </Text>
        <Text className="text-caption-lg text-fg-2">{meta}</Text>
        {settlement.status === 'REJECTED' && settlement.rejectReason ? (
          <Text className="text-caption-lg text-error">Lý do: {settlement.rejectReason}</Text>
        ) : null}
        {settlement.note ? (
          <Text className="text-caption-lg text-fg-2">“{settlement.note}”</Text>
        ) : null}
      </View>
      <View className="items-end gap-3xs">
        <Text className="text-label-lg font-semibold text-fg-1">
          {formatMoney(settlement.amount)}
        </Text>
        <Badge label={status} size="sm" variant={STATUS_VARIANT[settlement.status]} />
      </View>
    </View>
  );
}
