import { Text } from 'react-native';

import { formatNumber } from '@/shared/utils/format/currency.utils';

import { CHAT_LIMITS } from '../../chat.constants';

export interface CharCountProps {
  length: number;
}

/** "3.820/4.000" — chỉ hiện gần/qua trần (app.md §3 "4001 ký tự hiện lỗi"). */
export function CharCount({ length }: CharCountProps) {
  const overLimit = length > CHAT_LIMITS.maxChars;
  return (
    <Text className={overLimit ? 'text-label-xs text-error' : 'text-label-xs text-fg-2'}>
      {formatNumber(length)}/{formatNumber(CHAT_LIMITS.maxChars)}
    </Text>
  );
}
