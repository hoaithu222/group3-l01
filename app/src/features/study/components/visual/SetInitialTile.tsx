import { useId } from 'react';
import { Text, View } from 'react-native';
import { Circle, Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { type ThemeColorKey, useThemeColors } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { COVER_INK, COVER_SURFACE, type CoverTone, coverToneFor } from './cover-tone';

/** `size-6xl` = 64dp — cùng cỡ ô bìa `lg` của `SetCoverThumb`: hàng có ảnh và hàng không ảnh thẳng cột chữ. */
const TILE = 64;

/** Khoá token của nền `COVER_SURFACE` (bảng đó là CLASS, SVG cần MÀU). Đổi bảng kia thì đổi theo ở đây. */
const SURFACE_KEY: Record<CoverTone, ThemeColorKey> = {
  accent: 'surface-secondary',
  brand: 'surface-primary',
  info: 'surface-info',
  success: 'surface-success',
  warning: 'surface-warning',
};

/** Chữ cái đầu sau NFC ("đề cương" ⇒ "Đ", không tách dấu); `[...]` giữ nguyên emoji hai nửa. Tiêu đề rỗng ⇒ `null`. */
function initialOf(title: string): string | null {
  const first = [...title.trim().normalize('NFC')][0];
  return first ? first.toLocaleUpperCase('vi') : null;
}

export interface SetInitialTileProps {
  className?: string;
  /** Tiêu đề bộ — nguồn của tông màu (`coverToneFor`, cùng tông với ô bìa ở mọi màn khác) và của chữ cái đầu. */
  title: string;
}

/**
 * Ô bìa của bộ CHƯA có ảnh ở danh sách "Của tôi"/"Khám phá": mảng gradient theo tông suy từ tiêu đề + chữ cái đầu của bộ — hai bộ
 * cùng tông vẫn phân biệt được bằng chữ, thay cho icon `book` giống hệt nhau ở mọi hàng.
 *
 * ✅ Tĩnh hoàn toàn (hàng của `FlashList`): ⛔ không `Reveal`/vòng lặp/ánh quét — ô được tái dùng khi cuộn, animation sẽ chạy loạn.
 * ⚠️ Chữ cái vẽ bằng `Text` thật (thang chữ `header-md`, font của app) chứ không `SvgText` (font hệ thống); màu nét lấy từ
 * `useThemeColors()` theo CÙNG bảng `COVER_INK` đã đo ≥ 3:1 trên nền tông ở cả hai chế độ — chữ đậm 24dp là "chữ lớn", ngưỡng 3:1.
 * Gradient chỉ phủ thêm ≤ 22% màu nét về góc dưới phải, tâm ô (chỗ chữ) gần như vẫn là nền gốc.
 * ⚠️ Trang trí: tên bộ đã ở nhãn của hàng bấm được ⇒ ẩn khỏi trình đọc màn hình.
 */
export function SetInitialTile({ className, title }: SetInitialTileProps) {
  const colors = useThemeColors();
  const tone = coverToneFor(title);
  const ink = colors[COVER_INK[tone]];
  const initial = initialOf(title);
  const id = `set-initial-${useId().replace(/:/g, '')}`;

  return (
    <View
      accessibilityElementsHidden
      className={cn(
        'size-6xl items-center justify-center overflow-hidden rounded-sm',
        COVER_SURFACE[tone],
        className,
      )}
      // ⚠️ Nền tint ở View chỉ là lớp lót cho khung đầu (SVG chưa vẽ); bo góc + cắt của View mới là thứ giữ gradient tròn góc —
      // ⛔ đừng để Fabric làm phẳng View này.
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      testID="set-initial-tile"
    >
      <View className="absolute inset-0">
        <Svg height={TILE} width={TILE}>
          <Defs>
            <LinearGradient id={id} x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={colors[SURFACE_KEY[tone]]} stopOpacity={1} />
              <Stop offset="1" stopColor={ink} stopOpacity={0.22} />
            </LinearGradient>
          </Defs>
          <Rect fill={`url(#${id})`} height={TILE} width={TILE} x={0} y={0} />
          <Circle cx={TILE - 6} cy={TILE - 6} fill={ink} opacity={0.1} r={22} />
          <Circle cx={10} cy={10} fill={ink} opacity={0.08} r={6} />
        </Svg>
      </View>
      {initial ? (
        <Text className="text-header-md font-bold" style={{ color: ink }}>
          {initial}
        </Text>
      ) : (
        <Icon color={COVER_INK[tone]} name="book" size={28} variant="twotone" />
      )}
    </View>
  );
}
