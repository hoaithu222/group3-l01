import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/utils/style/cn';

import { BALANCE_TONE } from '../constants/balance-tone.constants';
import { describeBalance, formatMoney } from '../domain/money';

export interface BalanceHeaderProps {
  /** `> 0` được nợ · `< 0` đang nợ. `undefined` = chưa tải xong (KHÔNG hiện "0" — nói dối về tiền của người dùng). */
  balance: number | undefined;
  /** Tổng chi trong tháng của cả nhóm, hiện ở dòng phụ. */
  expensesThisMonth?: number;
}

/**
 * Số dư của TÔI ("Bạn đang nợ 37.500 VND" / "Bạn được nợ …" / "Đã thanh toán hết").
 * Chữ + icon + màu đi cùng nhau; số ÂM không bao giờ hiện dấu trừ (`describeBalance`).
 */
export function BalanceHeader({ balance, expensesThisMonth }: BalanceHeaderProps) {
  if (balance === undefined) return <Skeleton className="h-24 rounded-md" />;

  const { headline, tone } = describeBalance(balance);
  const style = BALANCE_TONE[tone];

  return (
    <View
      accessibilityLabel={headline}
      accessibilityRole="summary"
      accessible
      className={cn('gap-xs rounded-md p-md', style.surface)}
    >
      <View className="flex-row items-center gap-sm">
        {/* Ô icon nền đặc màu thẻ đặt trên dải màu cùng tông: icon nổi khỏi nền thay vì chìm vào nó. */}
        <View className="size-5xl items-center justify-center rounded-sm bg-bg-1">
          <Icon color={style.iconColor} name={style.icon} size="lg" variant="twotone" />
        </View>
        <Text className={cn('flex-1 text-header-sm font-semibold', style.text)}>{headline}</Text>
      </View>
      {expensesThisMonth !== undefined && expensesThisMonth > 0 ? (
        <Text className="text-caption-lg text-fg-2">
          Tháng này cả nhóm đã chi {formatMoney(expensesThisMonth)}
        </Text>
      ) : null}
    </View>
  );
}
