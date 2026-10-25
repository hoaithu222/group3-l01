import { Text, View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { Card } from '@/shared/ui/card';
import { GlowOrbs } from '@/shared/ui/effects';
import { IconTile } from '@/shared/ui/icon-tile';
import { AnimatedNumber } from '@/shared/ui/motion';
import { formatNumber } from '@/shared/utils/format/currency.utils';

import type { Wallet } from '../api/coins.types';
import { formatCoins } from '../utils/coin-format';
import { QuestProgressBar } from './QuestProgressBar';

/** Số trung gian của bộ đếm làm tròn — không hiện "1.249,6 xu". */
const coinsText = (value: number) => formatCoins(Math.round(value));

/**
 * Khối số dư ở đầu màn Ví (app.md p7-02 §3): icon xu + số dư lớn (chạy dần khi đổi — `AnimatedNumber`, tắt khi "Giảm chuyển
 * động") + "Hôm nay đã nhận X/200 xu". Số LUÔN kèm chữ "xu". Nhãn trợ năng đọc số dư THẬT (không đọc số đang chạy).
 * ⛔ `countOnMount={false}`: mở màn hiện thẳng số dư thật — đếm từ 0 là khoe "0 xu" GIẢ trong 600ms, mà đây là số dư của
 * người dùng chứ không phải màn trình diễn. Số chỉ CHẠY khi đổi thật (nhận/tiêu xu qua socket, nhận thưởng nhiệm vụ).
 *
 * ⚠️ "Hôm nay đã nhận" chỉ tính xu từ SỰ KIỆN (task đúng hạn, quiz, ôn tập…) — thưởng nhiệm vụ ngày nhận chủ động KHÔNG tính vào trần (BE `LIMITS.coins`),
 * nên có dòng nói rõ để người dùng không thắc mắc vì sao nhận nhiệm vụ mà thanh không nhích.
 *
 * ✅ `GlowOrbs` (quầng màu trôi chậm sau số dư) là vòng lặp nổi bật DUY NHẤT của màn Ví — ⛔ đừng thêm viền chạy/ánh quét
 * lặp ở nhiệm vụ hay lịch sử bên dưới. Dừng khi màn bị che (`useIsScreenFocused`); thẻ `overflow-hidden` để quầng không
 * tràn ra ngoài bo góc. Bản `subtle`: chữ `fg-2` nằm TRÊN quầng.
 */
export function CoinBalanceHeader({ wallet }: { wallet: Wallet }) {
  const focused = useIsScreenFocused();
  const capped = wallet.dailyCap > 0 && wallet.todayEarned >= wallet.dailyCap;

  return (
    <Card className="gap-md overflow-hidden">
      <GlowOrbs active={focused} intensity="subtle" />
      <View
        accessibilityLabel={`Số dư của bạn: ${formatCoins(wallet.balance)}`}
        accessible
        className="flex-row items-center gap-md"
      >
        <IconTile name="loyalty" size="lg" tone="accent" />
        <View className="flex-1 gap-3xs">
          <Text className="text-body-md text-fg-2">Số dư của bạn</Text>
          <AnimatedNumber
            className="text-header-lg font-bold text-fg-1"
            countOnMount={false}
            format={coinsText}
            value={wallet.balance}
          />
        </View>
      </View>

      <View className="gap-xs">
        <Text className="text-body-md text-fg-1">
          {`Hôm nay đã nhận ${formatNumber(wallet.todayEarned)}/${formatCoins(wallet.dailyCap)} từ hoạt động`}
        </Text>
        <QuestProgressBar
          accessibilityLabel={`Đã nhận ${formatCoins(wallet.todayEarned)} trên tối đa ${formatCoins(wallet.dailyCap)} hôm nay`}
          progress={wallet.todayEarned}
          target={wallet.dailyCap}
        />
        <Text className="text-caption-lg text-fg-2">
          {capped
            ? 'Bạn đã nhận đủ xu từ hoạt động hôm nay. Ngày mai sẽ nhận tiếp.'
            : 'Thưởng nhiệm vụ ngày nhận riêng, không tính vào giới hạn này.'}
        </Text>
      </View>
    </Card>
  );
}
