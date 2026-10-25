import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

export interface PlayerProgressProps {
  answered: number;
  /** Lưới đang mở (chỉ có nghĩa khi có `onToggleGrid`). */
  expanded?: boolean;
  total: number;
  /**
   * Có ⇒ cả khối là NÚT mở/đóng lưới câu (điện thoại: lưới ẩn mặc định). Không ⇒ chỉ hiển thị (máy tính bảng: lưới luôn
   * nằm ngay bên cạnh, nên không có gì để bật).
   */
  onToggleGrid?: () => void;
}

/**
 * Thanh tiến độ "Đã trả lời n/tổng" (app.md p4-02 §7). Số + thanh cùng nói một điều: chữ là nguồn đầy đủ, thanh chỉ để liếc.
 * Trên điện thoại cả khối là nút mở lưới câu (cao ≥ 44dp, có mũi tên báo nó bấm được và đang mở hay đóng).
 */
export function PlayerProgress({
  answered,
  expanded = false,
  onToggleGrid,
  total,
}: PlayerProgressProps) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  const body = (
    <View className="min-h-11 justify-center gap-xs rounded-md border-hairline border-border-1 bg-bg-1 px-sm py-xs">
      <View className="flex-row items-center justify-between gap-sm">
        <Text className="flex-1 text-label-lg font-semibold text-fg-1">
          {`Đã trả lời ${answered}/${total}`}
        </Text>
        {onToggleGrid ? (
          <View className="flex-row items-center gap-3xs">
            <Text className="text-label-md text-fg-2">
              {expanded ? 'Ẩn danh sách' : 'Xem danh sách'}
            </Text>
            <Icon color="fg-2" name={expanded ? 'arrow-up-small' : 'arrow-down-small'} size={16} />
          </View>
        ) : null}
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-surface-info">
        <View className="h-2 rounded-full bg-action-info" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );

  if (!onToggleGrid) return body;
  return (
    <Pressable
      accessibilityHint={expanded ? 'Đóng danh sách câu' : 'Mở danh sách câu'}
      accessibilityLabel={`Đã trả lời ${answered}/${total}`}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      className="active:opacity-80"
      onPress={onToggleGrid}
    >
      {body}
    </Pressable>
  );
}
