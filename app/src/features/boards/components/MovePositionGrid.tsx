import { View } from 'react-native';

import { Button } from '@/shared/ui/button';

/** Một ô của lưới vị trí ("Lên đầu cột", "Cuối cột"…). */
export interface MovePositionCell {
  disabled: boolean;
  key: string;
  label: string;
  onPress: () => void;
}

export interface MovePositionGridProps {
  /** Theo THỨ TỰ đọc (trái → phải, trên → dưới); 4 ô ⇒ lưới 2×2, 2 ô ⇒ một hàng. */
  cells: readonly MovePositionCell[];
}

/** Hai cột: nhãn dài nhất ("Xuống cuối cột") vẫn vừa nửa hàng trên máy 360dp mà không bị cắt "…". */
const COLUMNS = 2;

/**
 * Lưới nút vị trí trong cột của `MoveTaskSheet`: các ô BẰNG NHAU (`flex-1` + `Button fullWidth`).
 *
 * ❌ Trước đây là `flex-row flex-wrap` các nút ôm chữ: bốn viên thuốc dài ngắn khác nhau, xuống dòng lệch — mắt không
 * đọc ra được thứ tự "lên đầu · lên 1 · xuống 1 · xuống cuối". ⛔ `fullWidth` đi kèm lớp bọc `flex-1`: đặt `Button
 * fullWidth` trần vào `flex-row` là hai khối `width: 100%` không co, nút thứ hai bị đẩy ra ngoài mép tấm.
 */
export function MovePositionGrid({ cells }: MovePositionGridProps) {
  const rows = Array.from({ length: Math.ceil(cells.length / COLUMNS) }, (_, row) =>
    cells.slice(row * COLUMNS, (row + 1) * COLUMNS),
  );

  return (
    <View className="gap-xs">
      {rows.map((row) => (
        <View key={row.map((cell) => cell.key).join('-')} className="flex-row gap-xs">
          {row.map((cell) => (
            <View key={cell.key} className="flex-1">
              <Button
                disabled={cell.disabled}
                fullWidth
                label={cell.label}
                size="sm"
                variant="secondary"
                onPress={cell.onPress}
              />
            </View>
          ))}
          {/* Hàng cuối thiếu ô (số ô lẻ) ⇒ ô trống giữ cột thẳng, nút cuối không giãn gấp đôi. */}
          {row.length < COLUMNS ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}
