import { Text } from 'react-native';

import { COINS_NOTE } from '../constants/coins.constants';

/** Dòng nhắc "xu không quy đổi ra tiền" (app.md p7-02 §7) — có ở ví, cửa hàng, kho đồ, tấm xác nhận mua: đây là tiền ẢO, không có nạp/quy đổi. */
export function CoinsNote({ className }: { className?: string }) {
  return <Text className={className ?? 'text-caption-lg text-fg-2'}>{COINS_NOTE}</Text>;
}
