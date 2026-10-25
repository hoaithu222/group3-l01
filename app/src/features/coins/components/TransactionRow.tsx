import { Text, View } from 'react-native';

import { IconTile } from '@/shared/ui/icon-tile';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { CoinTransaction } from '../api/coins.types';
import { TX_TYPE_ART } from '../constants/coins.constants';
import { formatCoinDelta, formatCoins, transactionLabel } from '../utils/coin-format';

const FALLBACK_ART = { icon: 'loyalty', tone: 'neutral' } as const;

/**
 * Một dòng lịch sử xu: nhãn theo loại/nguồn, thời điểm, số xu CÓ DẤU ("+20 xu" xanh · "-50 xu") và số dư sau giao dịch (`balanceAfter` — sổ cái append-only
 * nên số này luôn đúng tại thời điểm đó). Dấu cộng/trừ + chữ nói nghĩa, không dựa vào màu. ⚠️ Cột trái `flex-1` để nhãn dài không đẩy số xu ra khỏi mép phải.
 */
export function TransactionRow({ tx }: { tx: CoinTransaction }) {
  const label = transactionLabel(tx);
  const when = formatDateTime(tx.at);
  const delta = formatCoinDelta(tx.amount);
  // Loại lạ (BE thêm trước app) ⇒ ô xu trung tính, hàng vẫn thẳng cột.
  const art = TX_TYPE_ART[tx.type] ?? FALLBACK_ART;

  return (
    <View
      accessibilityLabel={`${label}, ${delta}, số dư sau đó ${formatCoins(tx.balanceAfter)}, ${when}`}
      accessible
      className="flex-row items-center gap-sm border-b border-border-1 px-md py-sm"
    >
      {/* Ô icon theo loại giao dịch — trang trí (cả hàng là MỘT ô trợ năng có nhãn đầy đủ ở trên). */}
      <IconTile name={art.icon} size="sm" tone={art.tone} />
      <View className="flex-1 gap-3xs">
        <Text className="text-body-md text-fg-1">{label}</Text>
        <Text className="text-caption-lg text-fg-2">{when}</Text>
      </View>
      <View className="items-end gap-3xs">
        <Text
          className={
            tx.amount > 0
              ? 'text-body-lg font-semibold text-success'
              : 'text-body-lg font-semibold text-fg-1'
          }
        >
          {delta}
        </Text>
        <Text className="text-caption-lg text-fg-2">{`Số dư ${formatCoins(tx.balanceAfter)}`}</Text>
      </View>
    </View>
  );
}
