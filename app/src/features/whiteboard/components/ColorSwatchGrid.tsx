import { View } from 'react-native';

import { useThemeColors } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';
import { PressableScale } from '@/shared/ui/motion';
import { cn } from '@/shared/utils/style/cn';

import { WB_PALETTE, type PaletteEntry } from '../constants/palette';

/**
 * Số ô mỗi hàng — 6 màu của `WB_PALETTE` nằm gọn MỘT hàng. ⚠️ Khe `gap-2xs` (4) chứ không `gap-xs` (8): máy 320dp còn
 * (288 − 5 × 4) / 6 ≈ 44.7dp mỗi ô, vẫn ≥ 44; khe 8 thì tụt xuống ~41dp, dưới ngưỡng chạm.
 */
const COLUMNS = 6;

/** Cắt thành các hàng ĐỦ `COLUMNS` ô; hàng cuối thiếu thì chèn `null` giữ chỗ để mọi ô vẫn cùng bề rộng khi bảng màu dài thêm. */
function toRows(items: readonly PaletteEntry[]): (PaletteEntry | null)[][] {
  const rows: (PaletteEntry | null)[][] = [];
  for (let start = 0; start < items.length; start += COLUMNS) {
    const row: (PaletteEntry | null)[] = items.slice(start, start + COLUMNS);
    while (row.length < COLUMNS) row.push(null);
    rows.push(row);
  }
  return rows;
}

export interface ColorSwatchGridProps {
  /** Nhãn của cả nhóm cho trình đọc màn hình ("Màu nét"). */
  accessibilityLabel: string;
  onSelect: (id: string) => void;
  /** Id token màu đang chọn (`ink`, `blue`…). */
  selectedId: string;
}

/**
 * Lưới chấm màu CHỌN MỘT của `StylePanel`: mỗi ô là một chấm tròn 32dp trong vòng 44dp — ô bằng nhau, vùng chạm ≥ 44dp.
 *
 * ✅ Thay cho hàng `Chip` "● Đỏ" xuống dòng lởm chởm: màu nhìn bằng MÀU (chấm to), tên màu nằm ở `accessibilityLabel` của ô
 * và ở tiêu đề nhóm ("Màu nét · Đỏ" — `StylePanel` lo) nên không mất thông tin khi bỏ chữ trong ô.
 *
 * ⚠️ Chấm tô bằng `style` động (`useThemeColors`): màu là ID TOKEN lưu trong Y.Doc, `className` không tra được theo id.
 * ⚠️ Dấu tick `fg-inverse` đặt LÊN chấm: đo từ `colors.json`, cặp thấp nhất là `action-accent` (Vàng) ở chế độ sáng
 * 3.35:1 — trên ngưỡng 3:1 của hình phi văn bản; ở chế độ tối `fg-inverse` đảo sang màu tối, thấp nhất 5.73:1.
 * Không để MÀU là dấu hiệu duy nhất: còn vòng viền thương hiệu + `checked` cho trình đọc màn hình.
 */
export function ColorSwatchGrid({
  accessibilityLabel,
  onSelect,
  selectedId,
}: ColorSwatchGridProps) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
      className="gap-2xs"
    >
      {toRows(WB_PALETTE).map((row, rowIndex) => (
        <View key={String(rowIndex)} className="flex-row gap-2xs">
          {row.map((entry, index) => {
            if (!entry) return <View key={`empty-${String(index)}`} className="flex-1" />;
            const selected = entry.id === selectedId;
            return (
              <PressableScale
                key={entry.id}
                accessibilityLabel={entry.label}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                className="flex-1"
                contentClassName="min-h-12 items-center justify-center"
                scaleTo={0.94}
                onPress={() => onSelect(entry.id)}
              >
                {/* ⛔ `collapsable={false}`: vòng viền CHỈ có khi đang chọn — thiếu cờ này Android dựng view không kèm
                    `rounded-full` lúc vòng mới hiện ⇒ vòng VUÔNG (`docs/rules/styling-nativewind.md` → "Cạm bẫy"). */}
                <View
                  className={cn(
                    'h-11 w-11 items-center justify-center rounded-full',
                    selected && 'border-thick border-border-brand',
                  )}
                  collapsable={false}
                >
                  <View
                    className="h-8 w-8 items-center justify-center rounded-full"
                    style={{ backgroundColor: colors[entry.stroke] }}
                  >
                    {selected ? (
                      <Icon color="fg-inverse" name="checkmark-circle" size="sm" variant="solid" />
                    ) : null}
                  </View>
                </View>
              </PressableScale>
            );
          })}
        </View>
      ))}
    </View>
  );
}
