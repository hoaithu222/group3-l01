import type { WalletReminderTargetType } from '../types/workspace-wallet.types';

/**
 * Nhãn "Nơi đăng nhắc" theo loại đích (p6-04 admin.md §2.1). Nhóm chat riêng là
 * riêng tư nên CHỈ có loại, KHÔNG có tên. `CHANNEL` là nhãn khi BE không gửi tên
 * — BE chỉ gửi tên kênh CÔNG KHAI, nên kênh không có tên là kênh riêng tư.
 */
export const WALLET_TARGET_LABELS: Readonly<Record<WalletReminderTargetType, string>> = {
  NONE: 'Không đăng',
  CONVERSATION: 'Nhóm chat',
  CHANNEL: 'Kênh riêng tư',
};

/** Mã lỗi BE (404) khi cờ tính năng `wallet` đang tắt. */
export const WALLET_FEATURE_OFF_CODE = 'CFG_005';
