/**
 * Mặt tiền công khai của `wallet` (p6-04 ví nhóm & chia tiền). CHỈ những thứ NGOÀI feature cần:
 *  · `WalletReminderMessage` — renderer tin hệ thống, đăng ký vào `chat` ở `app/(app)/_layout.tsx`;
 *  · `resolveWalletNotificationHref` + href các màn — điểm nối cho hộp thư thông báo (p1-07, chưa dựng).
 *
 * ⛔ Không xuất màn hình ở đây: route (`app/**`) import thẳng `@/features/wallet/screens/…` như mọi feature
 * khác, còn barrel này được `(app)/_layout.tsx` nạp lúc khởi động — kéo cả cây màn hình vào là nạp sớm thứ
 * chưa ai mở.
 */
export { WalletReminderMessage } from './components/WalletReminderMessage';
export type { WalletReminderMessageProps } from './components/WalletReminderMessage';
export {
  addExpenseHref,
  expenseHref,
  historyHref,
  PAYMENT_PROFILES_HREF,
  resolveWalletNotificationHref,
  settleHref,
  walletHref,
  walletSettingsHref,
} from './utils/wallet-routes';
