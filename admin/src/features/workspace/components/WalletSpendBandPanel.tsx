import { memo } from 'react';

import { BoxPanel, EmptyState, Text } from '@/shared/ui';
import { formatMoneyBand } from '@/shared/utils/format';

import type { WalletLast30dView } from '../types/workspace-wallet.types';

export interface WalletSpendBandPanelProps {
  last30d: Pick<WalletLast30dView, 'expensesCount' | 'spendBand'>;
}

/**
 * Khối "Khoảng giá trị" (p6-04 admin.md §2.1) — tổng chi 30 ngày theo DẢI, không
 * bao giờ là số chính xác. BE đã gộp sẵn thành mã dải; client chỉ dịch ra nhãn
 * (`formatMoneyBand`). Chưa có khoản chi nào ⇒ hiện trạng thái rỗng thay vì dải
 * thấp nhất, để không đọc thành "đã chi < 500 nghìn".
 */
const WalletSpendBandPanel = memo(function WalletSpendBandPanel({
  last30d,
}: WalletSpendBandPanelProps) {
  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      description="Tổng chi của nhóm trong 30 ngày, làm tròn theo dải — không hiển thị số chính xác"
      title="Khoảng giá trị"
    >
      {last30d.expensesCount === 0 ? (
        <EmptyState
          description="Dải giá trị sẽ hiện khi nhóm ghi khoản chi đầu tiên."
          icon="wallet-bold"
          title="Chưa có khoản chi trong 30 ngày"
        />
      ) : (
        <div className="p-2">
          <Text className="tabular-nums" size="large" weight="medium">
            {formatMoneyBand(last30d.spendBand)}
          </Text>
        </div>
      )}
    </BoxPanel>
  );
});

export default WalletSpendBandPanel;
