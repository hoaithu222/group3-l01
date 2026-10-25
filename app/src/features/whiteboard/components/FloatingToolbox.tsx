import { ScrollView, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';

import { TOOLS, type WhiteboardTool } from '../constants/tools';

export interface FloatingToolboxProps {
  canRedo: boolean;
  canUndo: boolean;
  /** Bảng đã đầy: khoá mọi công cụ TẠO phần tử (vẫn dùng được Chọn/Tẩy để dọn bớt). */
  creationDisabled: boolean;
  onRedo: () => void;
  onStyle: () => void;
  onTool: (tool: WhiteboardTool) => void;
  onUndo: () => void;
  tool: WhiteboardTool;
  /** Máy tính bảng (≥ 600dp): cột dọc bên trái; điện thoại: hàng ngang dưới đáy. */
  vertical: boolean;
}

/**
 * Thanh công cụ của người CÓ QUYỀN VẼ (app.md §3 `FloatingToolbox`) — người xem/bảng lưu trữ KHÔNG render nó (CW-07: UI không có công cụ sửa).
 * Công cụ là `Chip` `role="radio"` của bộ chung: công cụ đang chọn có viền + `selected` cho trình đọc màn hình, không chỉ màu (app.md §7). Hoàn tác /
 * làm lại LUÔN hiện trên thanh (không chỉ bằng cử chỉ) và tắt khi ngăn xếp rỗng.
 *
 * ⚠️ `ScrollView` ngang cần `flex-1` để chiếm phần còn lại của hàng (cha là `flex-row`); trong cột dọc thì `grow-0` (không thì nó ăn hết chiều cao và
 * đẩy nút Kiểu ra khỏi màn). Chip `md` cao 40dp: đủ vùng chạm cùng `hitSlop` của bộ chung.
 */
export function FloatingToolbox({
  canRedo,
  canUndo,
  creationDisabled,
  onRedo,
  onStyle,
  onTool,
  onUndo,
  tool,
  vertical,
}: FloatingToolboxProps) {
  const history = (
    <View className={vertical ? 'flex-row gap-xs' : 'flex-row gap-2xs'}>
      <Button
        accessibilityLabel="Hoàn tác"
        disabled={!canUndo}
        iconLeft="arrow-left-small"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={onUndo}
      />
      <Button
        accessibilityLabel="Làm lại"
        disabled={!canRedo}
        iconLeft="arrow-right-small"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={onRedo}
      />
    </View>
  );

  const chips = TOOLS.map((def) => (
    <Chip
      key={def.id}
      disabled={creationDisabled && def.id !== 'select' && def.id !== 'eraser'}
      label={def.label}
      leading={<Icon name={def.icon} size="sm" />}
      role="radio"
      selected={tool === def.id}
      onPress={() => onTool(def.id)}
    />
  ));

  const style = (
    <Button
      accessibilityLabel="Kiểu vẽ: màu, độ dày, cỡ chữ"
      iconLeft="magic-wand-01"
      iconOnly
      size="sm"
      variant="tertiary"
      onPress={onStyle}
    />
  );

  if (vertical) {
    return (
      <View className="w-40 gap-xs border-r border-r-divider-1 bg-bg-1 p-xs" testID="whiteboard-toolbox">
        {history}
        <ScrollView
          className="grow-0"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <View className="items-start gap-xs">{chips}</View>
        </ScrollView>
        {style}
      </View>
    );
  }
  return (
    <View
      className="flex-row items-center gap-xs border-t border-t-divider-1 bg-bg-1 px-xs py-xs"
      testID="whiteboard-toolbox"
    >
      {history}
      <ScrollView
        className="flex-1"
        contentContainerClassName="items-center gap-xs px-2xs"
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {chips}
      </ScrollView>
      {style}
    </View>
  );
}
