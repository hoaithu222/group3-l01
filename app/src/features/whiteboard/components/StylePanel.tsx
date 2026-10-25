import { type ReactNode } from 'react';
import { View } from 'react-native';

import { useThemeColors } from '@/shared/theme';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Chip } from '@/shared/ui/chip';
import { Section } from '@/shared/ui/section';

import { FONT_SIZES, STROKE_WIDTHS, paletteEntry } from '../constants/palette';
import type { ToolStyle } from '../store/whiteboard-ui.store';
import { ColorSwatchGrid } from './ColorSwatchGrid';

export interface StylePanelProps {
  /** Có phần tử đang chọn: đổi kiểu sẽ áp luôn cho chúng (nói rõ trong mô tả để người dùng không ngạc nhiên). */
  hasSelection: boolean;
  onChange: (patch: Partial<ToolStyle>) => void;
  onClose: () => void;
  style: ToolStyle;
  visible: boolean;
}

const WIDTH_LABEL: Record<number, string> = { 2: 'Mảnh', 4: 'Vừa', 8: 'Dày' };

/**
 * Một hàng lựa chọn CHỌN MỘT: các `Chip` `fullWidth` chia ĐỀU bề ngang (không ôm theo độ dài nhãn rồi xuống dòng so le).
 * `radiogroup` + nhãn để trình đọc màn hình nói "đang ở nhóm nào" trước khi đọc từng lựa chọn.
 */
function ChoiceRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View accessibilityLabel={label} accessibilityRole="radiogroup" className="flex-row gap-xs">
      {children}
    </View>
  );
}

/**
 * Kiểu vẽ (app.md §2 `StylePanel`, bottom sheet): màu nét, tô nền hình, độ dày, cỡ chữ. Áp cho phần tử VẼ TIẾP THEO và cho các phần tử đang chọn (nếu có) —
 * màu lưu là ID TOKEN (`ink`, `blue`…) nên đổi sáng/tối không vỡ tương phản. Chấm màu và vạch xem trước lấy hex của theme đang hiển thị qua
 * `useThemeColors` (View `style` động — `className` không biết màu theo id token).
 *
 * ✅ Mỗi nhóm là một `Section` (tiêu đề cấp hai `tone="default"`); màu là LƯỚI chấm tròn bằng nhau (`ColorSwatchGrid`) và tiêu đề nhóm nói tên
 * màu đang chọn ("Màu nét · Đỏ"); độ dày có vạch xem trước ĐÚNG bề dày, tô bằng màu nét đang chọn. ❌ Bản cũ: chip chữ + chấm 16dp xuống dòng so le,
 * độ dày/cỡ chữ chỉ có chữ.
 */
export function StylePanel({ hasSelection, onChange, onClose, style, visible }: StylePanelProps) {
  const colors = useThemeColors();
  // Id lạ (bản app khác ghi) rơi về `ink` — tiêu đề, lưới và vạch xem trước cùng đọc bản đã quy đổi nên không lệch nhau.
  const stroke = paletteEntry(style.stroke);

  return (
    <BottomSheet
      description={hasSelection ? 'Áp cho cả phần tử đang chọn.' : undefined}
      scrollable
      title="Kiểu vẽ"
      visible={visible}
      onClose={onClose}
    >
      <View className="gap-md pb-md">
        <Section title={`Màu nét · ${stroke.label}`} tone="default">
          <ColorSwatchGrid
            accessibilityLabel="Màu nét"
            selectedId={stroke.id}
            onSelect={(id) => onChange({ stroke: id })}
          />
        </Section>
        <Section title="Tô nền hình" tone="default">
          <ChoiceRow label="Tô nền hình">
            <Chip
              fullWidth
              label="Không tô"
              role="radio"
              selected={style.fill === null}
              onPress={() => onChange({ fill: null })}
            />
            <Chip
              fullWidth
              label="Tô cùng màu"
              role="radio"
              selected={style.fill !== null}
              onPress={() => onChange({ fill: style.stroke })}
            />
          </ChoiceRow>
        </Section>
        <Section title="Độ dày nét" tone="default">
          <ChoiceRow label="Độ dày nét">
            {STROKE_WIDTHS.map((width) => (
              <Chip
                key={width}
                fullWidth
                label={WIDTH_LABEL[width] ?? String(width)}
                leading={
                  // ⚠️ `height` là DỮ LIỆU (bề dày nét thật, dp), không phải số đo trang trí — xem trước đúng nét sẽ vẽ.
                  // Thuần hình: nghĩa nằm ở nhãn chip ("Mảnh"/"Vừa"/"Dày").
                  <View
                    className="w-5 rounded-full"
                    style={{ backgroundColor: colors[stroke.stroke], height: width }}
                  />
                }
                role="radio"
                selected={style.width === width}
                onPress={() => onChange({ width })}
              />
            ))}
          </ChoiceRow>
        </Section>
        <Section title="Cỡ chữ" tone="default">
          <ChoiceRow label="Cỡ chữ">
            {FONT_SIZES.map((size) => (
              <Chip
                key={size}
                fullWidth
                label={String(size)}
                role="radio"
                selected={style.fontSize === size}
                onPress={() => onChange({ fontSize: size })}
              />
            ))}
          </ChoiceRow>
        </Section>
      </View>
    </BottomSheet>
  );
}
