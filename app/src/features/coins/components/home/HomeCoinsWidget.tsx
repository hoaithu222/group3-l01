import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { AnimatedNumber, PressableScale } from '@/shared/ui/motion';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatNumber } from '@/shared/utils/format/currency.utils';

import { useCoinsEnabled } from '../../hooks/useCoinsEnabled';
import { useCoinsEvents } from '../../hooks/useCoinsEvents';
import { useQuests } from '../../queries/quests.queries';
import { useWallet } from '../../queries/wallet.queries';
import { formatCoins } from '../../utils/coin-format';
import { COINS_HREF } from '../../utils/coins-routes';

const TITLE = 'Xu của bạn';

/** Số trung gian của bộ đếm làm tròn — không hiện "1.249,6 xu". */
const coinsText = (value: number) => formatCoins(Math.round(value));

/**
 * Widget số dư xu ở Trang chủ (khe `@/shared/home-widgets`, đăng ký ở `register-home-widgets.tsx` — `features/home` không import feature này): số dư kèm chữ
 * "xu", "Hôm nay đã nhận X/200 xu từ hoạt động" và (nếu có) số nhiệm vụ đang chờ nhận thưởng. Lối "Chi tiết" mở màn Ví. Ẩn khi cờ `coins` tắt hoặc lỗi tải;
 * tải lần đầu ⇒ khung xương. Nghe socket để số dư đổi ngay (Trang chủ là nơi người dùng ở lâu nhất, không thể chờ lần lấy nét sau).
 * ⚠️ Ẩn thì trả `null` thẳng (không bọc `View` rỗng): widget nằm trong khối có `gap`, `View` rỗng vẫn chừa khe.
 *
 * ✅ Cùng khuôn thẻ thống kê Trang chủ (nhãn + `IconTile sm` góc phải, số `header-md` đậm, một chú thích, `min-h-32`
 * `p-md` `rounded-md` — bản gốc ở `gamification/components/home/HomeStatCard.tsx`, ⛔ không import chéo feature). Cả thẻ bấm
 * được (`PressableScale`) vì bên trong KHÔNG có ô trợ năng riêng nào — một nút gộp đủ câu là trọn nghĩa.
 * ⛔ Số dư `countOnMount={false}` (cùng luật `CoinBalanceHeader`): đếm từ 0 là khoe "0 xu" GIẢ — số chỉ chạy khi đổi thật.
 * ⛔ Không vòng lặp/ánh quét: Trang chủ đã có một vòng lặp nổi bật, thẻ lại là nền sáng `bg-1`.
 */
export function HomeCoinsWidget() {
  const enabled = useCoinsEnabled();
  const wallet = useWallet();
  const quests = useQuests();
  useCoinsEvents();

  if (!enabled) return null;
  if (wallet.isLoading) {
    return (
      <Section title={TITLE}>
        <Skeleton className="h-32 rounded-md" />
      </Section>
    );
  }
  if (!wallet.data) return null;

  const { balance, dailyCap, todayEarned } = wallet.data;
  const claimable = quests.data?.filter((entry) => entry.claimable).length ?? 0;
  const earned = `Hôm nay đã nhận ${formatNumber(todayEarned)}/${formatCoins(dailyCap)} từ hoạt động`;
  const claim = claimable > 0 ? `${claimable} nhiệm vụ có thể nhận thưởng` : null;

  return (
    <Section
      action={
        <LinkButton
          accessibilityLabel="Mở ví xu"
          label="Chi tiết"
          onPress={() => router.push(COINS_HREF)}
        />
      }
      title={TITLE}
    >
      <PressableScale
        accessibilityHint="Mở ví xu"
        accessibilityLabel={`Số dư ${formatCoins(balance)}. ${earned}${claim ? `. ${claim}` : ''}`}
        accessibilityRole="button"
        contentClassName="min-h-32 gap-2xs rounded-md bg-bg-1 p-md"
        onPress={() => router.push(COINS_HREF)}
      >
        <View className="flex-row items-center gap-sm">
          <Text className="flex-1 text-label-md text-fg-2">Số dư hiện tại</Text>
          <IconTile name="loyalty" size="sm" tone="accent" />
        </View>
        <AnimatedNumber
          className="text-header-md font-bold text-fg-1"
          countOnMount={false}
          format={coinsText}
          value={balance}
        />
        <Text className="text-caption-lg text-fg-2">{earned}</Text>
        {claim ? (
          // Icon + chữ đậm: MÀU thương hiệu không phải dấu hiệu duy nhất của "có thưởng chờ nhận".
          <View className="flex-row items-center gap-2xs pt-2xs">
            <Icon color="fg-brand" name="checkmark-circle" size="sm" />
            <Text className="flex-1 text-label-md font-semibold text-fg-brand">{claim}</Text>
          </View>
        ) : null}
      </PressableScale>
    </Section>
  );
}
