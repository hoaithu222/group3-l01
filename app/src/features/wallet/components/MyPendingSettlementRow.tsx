import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import type { SettlementView } from '../api';
import { formatMoney } from '../domain/money';

export interface MyPendingSettlementRowProps {
  busy?: boolean;
  meId: string | undefined;
  settlement: SettlementView;
  toName: string;
  onCancel: (settlement: SettlementView) => void;
}

/**
 * Phía NGƯỜI GỬI của một settlement đang chờ: nói rõ đang chờ ai xác nhận, và cho
 * huỷ (chỉ người gửi huỷ được — README §6). Cố ý KHÔNG dùng `PendingSettlementCard`:
 * thẻ đó chỉ dành cho người nhận, tách hai component để không bao giờ lỡ tay hiện
 * nút "Đã nhận" cho người gửi.
 */
export function MyPendingSettlementRow({
  busy = false,
  meId,
  onCancel,
  settlement,
  toName,
}: MyPendingSettlementRowProps) {
  if (settlement.status !== 'PENDING' || meId === undefined || settlement.fromId !== meId)
    return null;

  return (
    <View className="flex-row items-center gap-sm rounded-md bg-surface-warning p-md">
      <Icon color="warning" name="timer" size="md" />
      <View className="flex-1 gap-3xs">
        <Text className="text-label-lg font-semibold text-fg-1">
          Chờ {toName} xác nhận {formatMoney(settlement.amount)}
        </Text>
        <Text className="text-caption-lg text-fg-2">
          Bạn đã báo chuyển. Bạn huỷ được cho tới khi họ xác nhận.
        </Text>
      </View>
      <Button
        accessibilityLabel={`Huỷ khoản báo chuyển ${formatMoney(settlement.amount)} cho ${toName}`}
        disabled={busy}
        label="Huỷ"
        size="sm"
        variant="secondary"
        onPress={() => onCancel(settlement)}
      />
    </View>
  );
}
