import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

export interface BlockedMessagePlaceholderProps {
  onReveal: () => void;
}

/**
 * Tin của người MÌNH đã chặn, thu gọn (p1-08 README §2, app.md §3): "Tin nhắn từ người bạn đã chặn — Xem".
 * Không nói tên, không trích nội dung; chạm "Xem" thì `MessageBubble` bung tin đó ra trong phiên.
 *
 * ⚠️ Cả dòng là MỘT nút (vùng chạm ≥ 44dp) chứ không chỉ chữ "Xem": chữ nhỏ trong một dòng mờ là vùng chạm
 * quá hẹp trên tin ở giữa cuộc trò chuyện dài.
 */
export function BlockedMessagePlaceholder({ onReveal }: BlockedMessagePlaceholderProps) {
  return (
    <View className="items-start px-md py-3xs">
      <Pressable
        accessibilityHint="Chạm để xem nội dung tin nhắn này"
        accessibilityLabel="Tin nhắn từ người bạn đã chặn. Xem"
        accessibilityRole="button"
        className="min-h-11 max-w-[80%] flex-row items-center gap-2xs rounded-xs bg-bg-2 px-sm py-2xs active:opacity-70 tablet:max-w-[60%]"
        onPress={onReveal}
      >
        {/* Icon "ẩn" (trang trí — nghĩa đã nằm ở nhãn của nút) cho biết nội dung đang được THU GỌN chứ không phải tin trống. */}
        <Icon color="fg-2" name="hide" size={16} />
        <Text className="flex-shrink text-caption-sm text-fg-2">Tin nhắn từ người bạn đã chặn</Text>
        <Text className="text-caption-sm font-semibold text-fg-brand">Xem</Text>
      </Pressable>
    </View>
  );
}
