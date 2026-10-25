import { Text, View } from 'react-native';

import { WalletReminderMessage } from './WalletReminderMessage';

export interface ReminderPreviewProps {
  debtorsCount: number;
  /** Có chọn nơi đăng không — không chọn thì không có tin nhóm nào để xem trước. */
  enabled: boolean;
  wsId: string;
}

/**
 * Xem trước TIN NHẮC sẽ hiện trong nhóm chat/kênh. Dùng CHÍNH renderer thật (`WalletReminderMessage`)
 * nên người quản trị thấy đúng cái cả nhóm sẽ thấy — và thấy rõ nó KHÔNG chứa số tiền của ai.
 */
export function ReminderPreview({ debtorsCount, enabled, wsId }: ReminderPreviewProps) {
  if (!enabled) {
    return (
      <Text className="text-caption-lg text-fg-2">
        Không đăng tin vào nhóm chat/kênh — người nợ chỉ nhận thông báo riêng của họ.
      </Text>
    );
  }

  return (
    <View className="gap-xs">
      <Text className="text-label-md font-semibold text-fg-1">Xem trước tin nhắn</Text>
      <WalletReminderMessage
        message={{
          systemPayload: { debtorsCount, workspaceId: wsId },
          systemType: 'WALLET_REMINDER',
        }}
      />
      <Text className="text-caption-lg text-fg-2">
        Tin đăng chung không bao giờ nêu số tiền của từng người.
      </Text>
    </View>
  );
}
