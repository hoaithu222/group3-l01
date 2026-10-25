import { memo } from 'react';

import { BoxPanel, SummaryCard } from '@/shared/ui';

import type { WalletLast30dView } from '../types/workspace-wallet.types';

export interface WalletMetricsPanelProps {
  last30d: WalletLast30dView;
}

/**
 * Khối "Số liệu 30 ngày" (p6-04 admin.md §2.1) — bốn `SummaryCard`, TOÀN BỘ chỉ
 * là SỐ ĐẾM: không có tổng tiền, không danh sách người, không chia theo người.
 * `animate={false}` vì đây là số đếm tĩnh, không cần hiệu ứng chạy số.
 */
const WalletMetricsPanel = memo(function WalletMetricsPanel({ last30d }: WalletMetricsPanelProps) {
  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      description="Chỉ số lượng — không nêu người hay số tiền cụ thể"
      title="Số liệu 30 ngày"
    >
      <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          animate={false}
          color="blue"
          icon="wallet-bold"
          label="Số khoản chi"
          value={last30d.expensesCount}
        />
        <SummaryCard
          animate={false}
          color="green"
          icon="circle-check-bold"
          label="Trả nợ đã xác nhận"
          value={last30d.confirmedSettlements}
        />
        <SummaryCard
          animate={false}
          color={last30d.staleSettlements > 0 ? 'yellow' : 'gray'}
          icon="clock-bold"
          label="Chờ xác nhận quá 48 giờ"
          value={last30d.staleSettlements}
        />
        <SummaryCard
          animate={false}
          color="gray"
          description="Chỉ đếm số người"
          icon="users-bold"
          label="Người đang nợ"
          value={last30d.debtorsCount}
        />
      </div>
    </BoxPanel>
  );
});

export default WalletMetricsPanel;
