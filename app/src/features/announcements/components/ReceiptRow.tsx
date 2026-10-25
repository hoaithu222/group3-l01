import { memo } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Icon } from '@/shared/ui/icon';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { ReceiptItem } from '../api/announcements.types';

export interface ReceiptRowProps {
  item: ReceiptItem;
}

/** Một người trong danh sách: ảnh + tên (+ "Đã xác nhận lúc …" ở tab đã xác nhận). Tên `null` (người đã xoá tên) → "Thành viên". */
export const ReceiptRow = memo(function ReceiptRow({ item }: ReceiptRowProps) {
  const name = item.name?.trim() || 'Thành viên';

  return (
    <View className="min-h-14 flex-row items-center gap-sm px-md py-xs">
      <Avatar name={name} size="md" source={item.avatarUrl ? { uri: item.avatarUrl } : undefined} />
      <View className="flex-1 gap-3xs">
        <Text className="text-label-md font-semibold text-fg-1" numberOfLines={1}>
          {name}
        </Text>
        {item.confirmedAt ? (
          <Text className="text-caption-sm text-fg-2">
            Đã xác nhận lúc {formatDateTime(item.confirmedAt)}
          </Text>
        ) : null}
      </View>
      {/* Dấu tick xanh cuối hàng cho người ĐÃ xác nhận — dấu hiệu phụ để quét nhanh (chữ "Đã xác nhận lúc …" mới là thông tin chính).
          ⛔ Không dùng chấm xanh ở góc avatar: ở mọi nơi khác trong app chấm đó nghĩa là "đang hoạt động". */}
      {item.confirmedAt ? <Icon color="success" name="checkmark-circle" size={20} /> : null}
    </View>
  );
});
