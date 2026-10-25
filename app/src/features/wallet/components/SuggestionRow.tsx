import { Text, View } from 'react-native';

import { AvatarGroup, type AvatarGroupUser } from '@/shared/ui/avatar-group';
import { Button, LinkButton } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import { formatMoney } from '../domain/money';

export interface SuggestionRowProps {
  amount: number;
  fromName: string;
  toName: string;
  /** Hai người của gợi ý (người trả → người nhận) cho cặp avatar đầu dòng — tên THẬT, kể cả khi dòng chữ ghi "Bạn". */
  people?: readonly [AvatarGroupUser, AvatarGroupUser];
  /** Chỉ người NỢ mới có nút "Trả" (tạo settlement với tôi là người gửi). */
  canPay: boolean;
  onPay: () => void;
  onExplain: () => void;
}

/**
 * Một gợi ý thanh toán "An → Bình  37.500 VND". Gợi ý là kết quả GỘP nợ tối
 * giản, nên khi tôi là người phải trả có kèm "Vì sao?" — người dùng hay thắc mắc
 * tại sao phải trả cho một người họ chưa từng nợ (README §10).
 *
 * Cặp avatar chồng nhau đầu dòng (người trả trước, người nhận sau) — nhìn là biết "ai với ai" mà chưa cần đọc tên. Thuần trang trí trong
 * ô trợ năng đã gộp của dòng (nhãn "An chuyển cho Bình …" nói đủ).
 */
export function SuggestionRow({
  amount,
  canPay,
  fromName,
  onExplain,
  onPay,
  people,
  toName,
}: SuggestionRowProps) {
  return (
    <View className="gap-xs py-xs">
      <View
        accessibilityLabel={`${fromName} chuyển cho ${toName} ${formatMoney(amount)}`}
        accessible
        className="flex-row items-center gap-xs"
      >
        {people ? <AvatarGroup size="xs" users={people} /> : null}
        <Text className="shrink text-body-lg font-semibold text-fg-1" numberOfLines={1}>
          {fromName}
        </Text>
        <Icon color="fg-2" name="arrow-right-small" size="sm" />
        <Text className="flex-1 text-body-lg font-semibold text-fg-1" numberOfLines={1}>
          {toName}
        </Text>
        <Text className="text-label-lg font-semibold text-fg-1">{formatMoney(amount)}</Text>
      </View>

      {canPay ? (
        <View className="flex-row items-center justify-between gap-sm">
          {/* `flex-1`: nhãn "Vì sao trả cho <tên>?" dài theo tên người — không có chỗ co thì đẩy nút "Trả" ra ngoài mép. */}
          <View className="flex-1 items-start">
            <LinkButton label={`Vì sao trả cho ${toName}?`} size="sm" onPress={onExplain} />
          </View>
          <Button
            accessibilityLabel={`Trả ${formatMoney(amount)} cho ${toName}`}
            label="Trả"
            size="sm"
            onPress={onPay}
          />
        </View>
      ) : null}
    </View>
  );
}
