import type { MoneyBand } from '@/shared/utils/format/money-band.utils';

/**
 * Kiểu dữ liệu tab `wallet` — khớp `WalletStatsView` phía BE
 * (`GET /admin/workspaces/:id/wallet-stats`, p6-04 admin.md §2.1).
 *
 * ⛔ CHỈ số liệu TỔNG HỢP ẨN DANH. CỐ Ý không có (và không được thêm) trường nào
 * nêu người dùng hay số tiền chính xác: khoản chi, số dư từng người, settlement,
 * tài khoản ngân hàng. `tests/features/workspace/wallet-privacy.test.tsx` quét
 * file này để chặn.
 */
export type WalletReminderTargetType = 'NONE' | 'CONVERSATION' | 'CHANNEL';

export interface WalletReminderView {
  enabled: boolean;
  /** Đã được server định dạng ("Thứ Sáu 09:00 Asia/Ho_Chi_Minh") — hiển thị nguyên văn. */
  cronText: string;
  targetType: WalletReminderTargetType;
  /**
   * CHỈ có khi `targetType = CHANNEL` và kênh công khai. Nhóm chat riêng / kênh
   * riêng tư luôn là `null` — BE không gửi tên, client cũng không dựng tên.
   */
  targetChannelName: string | null;
}

export interface WalletLast30dView {
  expensesCount: number;
  confirmedSettlements: number;
  /** Số lần trả nợ ở trạng thái chờ xác nhận quá 48 giờ. */
  staleSettlements: number;
  /** Số người đang nợ — CHỈ ĐẾM, không danh tính. */
  debtorsCount: number;
  /** Tổng chi 30 ngày theo dải (không phải số chính xác). */
  spendBand: MoneyBand;
}

export interface WalletStatsView {
  /** Ví của workspace đang bật hay tắt. */
  enabled: boolean;
  reminder: WalletReminderView;
  last30d: WalletLast30dView;
}
