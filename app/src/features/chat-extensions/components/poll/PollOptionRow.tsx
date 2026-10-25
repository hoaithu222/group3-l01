import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { PollOptionView } from '../../api/chat-extensions.types';

export interface PollOptionRowProps {
  option: PollOptionView;
  /** Chọn nhiều → hộp kiểm (vuông); chọn một → nút radio (tròn). */
  multi: boolean;
  selected: boolean;
  /** Khảo sát đã kết thúc / đang ngoại tuyến — không chạm được nhưng VẪN đọc được kết quả. */
  disabled: boolean;
  onPress: (optionId: string) => void;
}

/** Số phiếu đọc lên: "1 phiếu", "12 phiếu". */
const votesLabel = (count: number): string => `${count} phiếu`;

/**
 * Một lựa chọn của khảo sát: dấu chọn + chữ + số phiếu + phần trăm, nền là thanh tiến độ (độ rộng = phần trăm). Kết quả LUÔN có chữ (số phiếu · %), không chỉ thanh màu
 * (luật trợ năng: đừng để MÀU làm dấu hiệu duy nhất). Thanh đổi tức thì, KHÔNG hoạt ảnh — hợp "giảm chuyển động" mà không phải đọc cài đặt hệ thống.
 *
 * ⚠️ Thanh nền là `View` tĩnh (không `Animated.View`): chỉ `width` phần trăm là style động, mọi thứ khác là class — đúng luật "thẻ mang `useAnimatedStyle` không mang `className`".
 * Vùng chạm cao ≥ 44dp (`min-h-11`). `radio`/`checkbox` + `checked` để trình đọc màn hình nói được "đã chọn" (`accessibilityState`), nhãn đọc trọn "Lựa chọn A, 12 phiếu, 40 phần trăm".
 */
export const PollOptionRow = memo(function PollOptionRow({
  option,
  multi,
  selected,
  disabled,
  onPress,
}: PollOptionRowProps) {
  const percent = Math.min(100, Math.max(0, option.percent));
  return (
    <Pressable
      accessibilityLabel={`${option.text}, ${votesLabel(option.voteCount)}, ${percent} phần trăm`}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, disabled }}
      // Phản hồi nhấn (Android không có gợn sóng mặc định) — chỉ một class, không thêm state cho ô của danh sách ảo.
      className="active:opacity-80"
      disabled={disabled}
      onPress={() => onPress(option.id)}
    >
      <View className="min-h-11 justify-center overflow-hidden rounded-2xs border-hairline border-border-1 bg-bg-1">
        <View className="absolute inset-y-0 left-0 bg-action-tint-strong" style={{ width: `${percent}%` }} />
        <View className="flex-row items-center gap-xs px-sm py-xs">
          {selected ? (
            <Icon color="fg-brand" name={multi ? 'checkmark-square' : 'checkmark-circle'} size="sm" variant="solid" />
          ) : (
            <View className={multi ? 'h-5 w-5 rounded-3xs border-medium border-border-brand-subtle' : 'h-5 w-5 rounded-full border-medium border-border-brand-subtle'} />
          )}
          <Text className="flex-1 text-body-md text-fg-1">{option.text}</Text>
          <Text className="text-label-sm font-semibold text-fg-1">
            {`${option.voteCount} · ${percent}%`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});
