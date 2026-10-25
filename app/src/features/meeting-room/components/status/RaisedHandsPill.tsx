import { Pressable, Text, View } from 'react-native';

import { HandGlyph } from '../hand/HandGlyph';

export interface RaisedHandsPillProps {
  /** Số người đang giơ tay (`raisedHandOrder(people).size`); `≤ 0` thì không vẽ gì. */
  count: number;
  /** Mở danh sách người — nhóm "Đang giơ tay" nằm đầu danh sách, đúng thứ tự giơ tay. */
  onPress: () => void;
}

/**
 * Viên "✋ n" ở thanh tiêu đề — MỌI người đều thấy có bao nhiêu người đang xin phát biểu (Meet/Teams), không riêng chủ trì; chạm mở danh
 * sách người. `n` cùng nguồn `raisedHandOrder` với số thứ tự trên ô người và danh sách ⇒ ba chỗ không lệch số.
 *
 * ✅ Nền `action-accent` + chữ `action-accent-fg` (cặp đã đo tương phản ở cả hai chế độ) — nổi trên nền phòng tối, khác hẳn các nút viền
 * trắng bên cạnh. Trạng thái nằm ở CHỮ: số hiện bằng chữ, câu đọc "n người đang giơ tay" (bàn tay `HandGlyph` chỉ là hình, ẩn khỏi
 * trình đọc màn hình). Viên cao 32dp, vùng chạm `min-h-11` (44dp).
 */
export function RaisedHandsPill({ count, onPress }: RaisedHandsPillProps) {
  if (count <= 0) return null;
  return (
    <Pressable
      accessibilityHint="Mở danh sách người tham gia"
      accessibilityLabel={`${String(count)} người đang giơ tay`}
      accessibilityRole="button"
      className="min-h-11 justify-center active:opacity-70"
      onPress={onPress}
    >
      <View className="h-8 flex-row items-center gap-3xs rounded-full bg-action-accent px-xs">
        <HandGlyph size="sm" />
        <Text
          className="text-label-md font-semibold text-action-accent-fg"
          maxFontSizeMultiplier={1.3}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}
