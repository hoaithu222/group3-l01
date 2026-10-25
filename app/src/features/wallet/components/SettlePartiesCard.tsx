import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';

import { formatMoney } from '../domain/money';

export interface SettleParty {
  avatarUrl?: string | null;
  /** Tên THẬT (sinh chữ viết tắt khi không có ảnh). */
  name: string;
}

export interface SettlePartiesCardProps {
  /** Số tiền đang nhập — cập nhật theo từng lần gõ; `null` = chưa nhập (chỉ vẽ mũi tên). */
  amount: number | null;
  payee: SettleParty;
  payer: SettleParty;
}

function Party({ caption, party }: { caption: string; party: SettleParty }) {
  return (
    <View className="flex-1 items-center gap-2xs">
      <Avatar
        name={party.name}
        size="lg"
        source={party.avatarUrl ? { uri: party.avatarUrl } : undefined}
      />
      <Text className="text-center text-label-md font-semibold text-fg-1" numberOfLines={1}>
        {party.name}
      </Text>
      <Text className="text-caption-sm text-fg-2">{caption}</Text>
    </View>
  );
}

/**
 * Đầu màn trả nợ: "Bạn → Bình · 37.500 VND" bằng HAI ảnh đại diện + mũi tên — người dùng thấy ngay mình đang trả AI trước khi đụng vào ô
 * số tiền (lỗi hay gặp nhất của màn chuyển tiền là chọn nhầm người nhận). Số tiền dưới mũi tên đi theo ô nhập.
 * Cả khối là MỘT ô trợ năng đọc một câu ("Bạn trả Bình 37.500 VND"); ảnh/mũi tên bên trong không đọc riêng.
 */
export function SettlePartiesCard({ amount, payee, payer }: SettlePartiesCardProps) {
  const money = amount !== null && amount > 0 ? formatMoney(amount) : null;

  return (
    <Card>
      <View
        accessibilityLabel={`Bạn trả ${payee.name}${money ? ` ${money}` : ''}`}
        accessible
        className="flex-row items-center gap-sm"
      >
        <Party caption="Người trả" party={payer} />
        <View className="items-center gap-2xs">
          <View className="size-4xl items-center justify-center rounded-full bg-surface-primary">
            <Icon color="fg-brand" name="arrow-right" size="md" />
          </View>
          {money ? <Text className="text-label-md font-semibold text-fg-brand">{money}</Text> : null}
        </View>
        <Party caption="Người nhận" party={payee} />
      </View>
    </Card>
  );
}
