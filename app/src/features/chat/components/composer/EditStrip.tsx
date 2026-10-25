import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

export interface EditStripProps {
  onCancel: () => void;
}

/**
 * Báo đang SỬA tin (không phải soạn mới) — nội dung cũ đã nạp sẵn vào ô nhập,
 * nút "Lưu" chính là nút Gửi của `Composer` khi đang ở chế độ này (app.md §3).
 */
export function EditStrip({ onCancel }: EditStripProps) {
  return (
    // Thẻ nhỏ cùng dáng với `ReplyStrip` (lề 16, nền `bg-3`, cách hàng nhập 8) — xem chú thích ở đó vì sao không còn `border-t` full-bleed.
    <View className="mx-md mt-xs flex-row items-center gap-xs rounded-xs bg-bg-3 px-sm py-xs">
      <Icon color="fg-brand" name="edit" size={16} />
      <Text className="flex-1 text-label-xs font-semibold text-fg-brand">Đang sửa tin nhắn</Text>
      {/* Icon 18dp + `hitSlop` 14 mỗi phía = 46dp — đủ ngưỡng chạm 44dp (`hitSlop={8}` cũ chỉ ra 34dp). */}
      <Pressable accessibilityLabel="Huỷ sửa" accessibilityRole="button" hitSlop={14} onPress={onCancel}>
        <Icon color="fg-2" name="cancel" size={18} />
      </Pressable>
    </View>
  );
}
