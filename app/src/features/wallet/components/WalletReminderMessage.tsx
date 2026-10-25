import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import { walletHref } from '../utils/wallet-routes';

/** Phần của `MessageView` (chat) mà renderer này cần — khai cấu trúc để KHÔNG import chéo feature `chat`. */
export interface WalletReminderMessageProps {
  message: { systemPayload: Record<string, unknown> | null; systemType: string | null };
}

/**
 * Renderer tin hệ thống `WALLET_REMINDER` (p6-04 README §2): "N bạn còn khoản chưa
 * thanh toán" + nút "Mở ví".
 *
 * ⛔ KHÔNG BAO GIỜ hiện số tiền — dù `systemPayload` có mang thêm trường nào. Tin này nằm
 * trong nhóm chat/kênh mà cả nhóm đều đọc; số tiền của từng người là chuyện riêng (đi
 * qua thông báo riêng, có DND). Component chỉ đọc `workspaceId` + `debtorsCount`, nên
 * dù BE sau này lỡ nhét thêm `amount` vào payload thì cũng không ra màn hình. Test
 * `WalletReminderMessage.test.tsx` khoá điều này.
 *
 * Đăng ký vào chat qua `registerSystemMessageRenderer` (xem `app/(app)/_layout.tsx`) —
 * chat KHÔNG import feature này (ngoại lệ "chat là feature NỀN", `feature-structure.md`).
 */
export function WalletReminderMessage({ message }: WalletReminderMessageProps) {
  const payload = message.systemPayload ?? {};
  const workspaceId = typeof payload.workspaceId === 'string' ? payload.workspaceId : null;
  const count =
    typeof payload.debtorsCount === 'number' && payload.debtorsCount > 0
      ? Math.floor(payload.debtorsCount)
      : null;
  const text =
    count === null ? 'Nhóm còn khoản chưa thanh toán' : `${count} bạn còn khoản chưa thanh toán`;

  return (
    <View className="mx-md my-2xs flex-row items-center gap-sm self-center rounded-md bg-surface-warning p-sm">
      <Icon color="warning" name="wallet-add" size="md" />
      <Text className="shrink text-label-md text-fg-1">{text}</Text>
      {workspaceId ? (
        <Button
          label="Mở ví"
          size="sm"
          variant="secondary"
          onPress={() => router.push(walletHref(workspaceId))}
        />
      ) : null}
    </View>
  );
}
