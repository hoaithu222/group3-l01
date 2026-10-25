import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Dialog } from '@/shared/ui/modal';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { SettlementView } from '../api';
import { SETTLEMENT_METHOD_LABEL } from '../constants/wallet.constants';
import { formatMoney } from '../domain/money';
import { WalletAssetImage } from './WalletAssetImage';

export interface PendingSettlementCardProps {
  /** Đang gọi API xác nhận/từ chối — khoá cả hai nút (bấm đúp là hai lượt). */
  busy?: boolean;
  fromName: string;
  meId: string | undefined;
  settlement: SettlementView;
  onConfirm: (settlement: SettlementView) => void;
  onReject: (settlement: SettlementView) => void;
}

/**
 * Thẻ "cần tôi xác nhận": người khác báo đã trả tiền cho tôi.
 *
 * ⛔ CHỈ hiện cho NGƯỜI NHẬN (`toId === meId`) và khi còn PENDING (ma trận quyền
 * README §6). Người gửi không có nút xác nhận — thấy nó là mời họ tự xác nhận
 * khoản mình trả (BE vẫn chặn, nhưng UI không được gợi ý làm điều đó).
 *
 * Xác nhận đi qua hộp thoại vì ĐỔI SỔ NỢ và không hoàn tác được; từ chối cần lý do
 * nên do màn cha mở `RejectSettlementSheet`.
 */
export function PendingSettlementCard({
  busy = false,
  fromName,
  meId,
  onConfirm,
  onReject,
  settlement,
}: PendingSettlementCardProps) {
  const [confirming, setConfirming] = useState(false);

  if (settlement.status !== 'PENDING' || meId === undefined || settlement.toId !== meId)
    return null;

  const amount = formatMoney(settlement.amount);

  return (
    <Card title={`${fromName} báo đã trả bạn ${amount}`}>
      <View className="gap-xs">
        <Text className="text-body-md text-fg-2">
          {SETTLEMENT_METHOD_LABEL[settlement.method]} · {formatDateTime(settlement.createdAt)}
          {settlement.method === 'BANK' ? ` · Mã SA ${settlement.code}` : ''}
        </Text>
        {settlement.note ? (
          <Text className="text-body-md text-fg-1">“{settlement.note}”</Text>
        ) : null}
        {settlement.proofAssetId ? (
          <WalletAssetImage alt="Ảnh chứng từ chuyển khoản" assetId={settlement.proofAssetId} />
        ) : null}
        <Text className="text-caption-lg text-fg-2">
          Chỉ xác nhận sau khi bạn đã thấy tiền về tài khoản hoặc đã nhận tiền mặt.
        </Text>

        <View className="flex-row gap-sm pt-xs">
          <View className="flex-1">
            <Button
              accessibilityLabel={`Từ chối khoản ${amount} của ${fromName}`}
              disabled={busy}
              fullWidth
              label="Từ chối"
              variant="secondary"
              onPress={() => onReject(settlement)}
            />
          </View>
          <View className="flex-1">
            <Button
              accessibilityLabel={`Đã nhận ${amount} từ ${fromName}`}
              disabled={busy}
              fullWidth
              label="Đã nhận"
              onPress={() => setConfirming(true)}
            />
          </View>
        </View>
      </View>

      <Dialog
        description={`${fromName} — ${amount}. Sau khi xác nhận, số dư của hai bên sẽ được cập nhật và không hoàn tác được.`}
        primaryAction={{
          label: 'Xác nhận đã nhận',
          loading: busy,
          onPress: () => {
            setConfirming(false);
            onConfirm(settlement);
          },
        }}
        secondaryAction={{ label: 'Chưa', onPress: () => setConfirming(false) }}
        title="Xác nhận đã nhận tiền?"
        visible={confirming}
        onClose={() => setConfirming(false)}
      />
    </Card>
  );
}
