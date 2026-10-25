import { WALLET_TARGET_LABELS } from '../constants/workspace-wallet.constants';
import type { WalletReminderView } from '../types/workspace-wallet.types';

/**
 * Nhãn "Nơi đăng nhắc" cho khối Trạng thái.
 *
 * Tên CHỈ được đọc khi đích là `CHANNEL`. Với `CONVERSATION` (nhóm chat riêng) bỏ
 * qua hoàn toàn `targetChannelName` — kể cả khi BE lỡ gửi kèm — để tên nhóm riêng
 * không có đường nào lên giao diện quản trị. Loại lạ (BE thêm mới) rơi về `—`.
 */
export function walletReminderTargetLabel(
  reminder: Pick<WalletReminderView, 'targetType' | 'targetChannelName'>,
): string {
  if (reminder.targetType === 'CHANNEL') {
    return reminder.targetChannelName?.trim() || WALLET_TARGET_LABELS.CHANNEL;
  }
  return (WALLET_TARGET_LABELS as Readonly<Record<string, string | undefined>>)[reminder.targetType] ?? '—';
}
