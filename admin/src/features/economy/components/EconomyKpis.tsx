import { memo } from 'react';

import { SummaryCard } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { NO_DATA } from '../constants/economy.constants';
import type { EconomyOverviewData } from '../types/economy.types';
import { formatSignedCoins } from '../utils/economy-format.utils';

export interface EconomyKpisProps {
  /** `undefined` (đang tải / lỗi) → mọi thẻ hiện `—`, không bao giờ `0`. */
  data: EconomyOverviewData | undefined;
}

/**
 * Năm thẻ số liệu tổng quan (admin.md p7-02 §2.1): phát hành, đã tiêu, đốt phí, điều chỉnh ròng của admin trong khoảng đã chọn, và số xu
 * đang lưu hành (Σ số dư mọi ví, tại thời điểm hiện tại). Chuyển giữa người dùng (bán ở chợ) KHÔNG phải phát hành.
 */
const EconomyKpis = memo(function EconomyKpis({ data }: EconomyKpisProps) {
  const range = data ? `${data.days} ngày gần nhất` : undefined;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard
        animate={false}
        color="green"
        description={range}
        icon="arrow-trend-up-bold"
        label="Xu phát hành"
        value={data ? formatNumber(data.totals.issued) : NO_DATA}
      />
      <SummaryCard
        animate={false}
        color="yellow"
        description={range}
        icon="arrow-trend-down-bold"
        label="Xu đã tiêu"
        value={data ? formatNumber(data.totals.spent) : NO_DATA}
      />
      <SummaryCard
        animate={false}
        color="red"
        description={range ? `${range} · phí chợ` : undefined}
        icon="bolt-bold"
        label="Xu bị đốt"
        value={data ? formatNumber(data.totals.burned) : NO_DATA}
      />
      <SummaryCard
        animate={false}
        color="gray"
        description={range ? `${range} · do admin` : undefined}
        icon="plus-minus-bold"
        label="Điều chỉnh ròng"
        value={data ? formatSignedCoins(data.totals.adjusted) : NO_DATA}
      />
      <SummaryCard
        animate={false}
        color="blue"
        description="Tổng số dư mọi ví hiện tại"
        icon="wallet-bold"
        label="Xu đang lưu hành"
        value={data ? formatNumber(data.circulating) : NO_DATA}
      />
    </div>
  );
});

export default EconomyKpis;
