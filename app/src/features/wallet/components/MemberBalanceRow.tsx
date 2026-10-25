import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { BALANCE_TONE } from '../constants/balance-tone.constants';
import { describeBalance } from '../domain/money';

export interface MemberBalanceRowProps {
  avatarUrl?: string | null;
  balance: number;
  isMe: boolean;
  name: string;
}

/**
 * Một dòng số dư thành viên. Trạng thái nói bằng CHỮ ("nợ 37.500 VND" / "được nợ …" /
 * "không nợ") kèm icon — màu chỉ là lớp phụ. Cả dòng gộp thành MỘT ô cho trình đọc
 * màn hình: "An, bạn, nợ 37.500 VND".
 */
export function MemberBalanceRow({ avatarUrl, balance, isMe, name }: MemberBalanceRowProps) {
  const { short, tone } = describeBalance(balance, 'other');
  const style = BALANCE_TONE[tone];

  return (
    <View
      accessibilityLabel={`${name}${isMe ? ', bạn' : ''}, ${short}`}
      accessible
      className="min-h-11 flex-row items-center gap-sm py-2xs"
    >
      <Avatar name={name} size="sm" source={avatarUrl ? { uri: avatarUrl } : undefined} />
      <Text className="flex-1 text-body-lg text-fg-1" numberOfLines={1}>
        {name}
        {isMe ? <Text className="text-caption-lg text-fg-2"> (Bạn)</Text> : null}
      </Text>
      <View className="flex-row items-center gap-2xs">
        <Icon color={style.iconColor} name={style.icon} size="sm" />
        <Text className={cn('text-label-md font-semibold', style.text)}>{short}</Text>
      </View>
    </View>
  );
}
