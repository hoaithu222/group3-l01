import { useId } from 'react';
import { View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';
import { tv } from 'tailwind-variants';

import { useThemeColors } from '@/shared/theme';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * "Mục lục" của quyển sách = ba phân hệ app gom lại (tin nhắn · lịch họp · học tập — cùng icon/tông với Trang chủ và hình
 * đầu màn cũ). Nằm ngang thì trang chỉ 48×64 — ô 32dp không vừa ⇒ thay bằng chấm cùng màu ngữ nghĩa của tông.
 */
const MODULES = [
  { dot: 'bg-fg-brand', icon: 'chat-bubble', tone: 'brand' },
  { dot: 'bg-info', icon: 'calendar', tone: 'info' },
  { dot: 'bg-success', icon: 'book', tone: 'success' },
] as const satisfies readonly { dot: string; icon: IconName; tone: IconTileTone }[];

const inside = tv(
  {
    slots: {
      root: 'flex-1 justify-center',
      row: 'flex-row items-center',
      text: 'flex-1',
      line: 'rounded-full bg-border-1',
      dot: 'size-2 rounded-full',
    },
    variants: {
      compact: {
        true: { root: 'gap-2xs px-2xs', row: 'gap-2xs', text: 'gap-3xs', line: 'h-0.5' },
        false: { root: 'gap-xs px-xs', row: 'gap-xs', text: 'gap-2xs', line: 'h-1' },
      },
    },
  },
  { twMergeConfig },
);

/** Bóng gáy phủ lên mép trong của trang — ruột sách "lõm" vào gáy thay vì phẳng như tờ giấy dán. */
const GUTTER_WIDTH = { compact: 6, regular: 12 } as const;

export interface BookInsidePageProps {
  compact: boolean;
}

/**
 * Trang trong (nửa phải, KHÔNG xoay) — thứ quyển sách mở ra để khoe. Ba hàng "ô phân hệ + hai dòng chữ giả".
 *
 * ⚠️ Màu gradient qua `useThemeColors()` (`stopColor` không nhận class — NativeWind bỏ qua ÂM THẦM ⇒ hình ra đen). Lấy
 * `overlay`: token TỐI ở cả hai chế độ (sáng #1A1A1A · tối #040A09) nên bóng luôn là bóng — `fg-1` thì ở chế độ tối là
 * màu SÁNG, "bóng" thành vệt sáng. `id` gradient từ `useId()` (bỏ `:` — `url(#:r1:)` không phân tích được).
 */
export function BookInsidePage({ compact }: BookInsidePageProps) {
  const colors = useThemeColors();
  const gutterId = `book-gutter-${useId().replace(/:/g, '')}`;
  const styles = inside({ compact });
  const gutterWidth = compact ? GUTTER_WIDTH.compact : GUTTER_WIDTH.regular;

  return (
    <View className={styles.root()}>
      <Svg
        height="100%"
        style={{ bottom: 0, left: 0, position: 'absolute', top: 0 }}
        width={gutterWidth}
      >
        <Defs>
          <LinearGradient id={gutterId} x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor={colors.overlay} stopOpacity={0.14} />
            <Stop offset="1" stopColor={colors.overlay} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${gutterId})`} height="100%" width="100%" />
      </Svg>
      {MODULES.map((entry) => (
        <View key={entry.icon} className={styles.row()}>
          {compact ? (
            <View className={styles.dot({ className: entry.dot })} />
          ) : (
            <IconTile name={entry.icon} size="sm" tone={entry.tone} />
          )}
          <View className={styles.text()}>
            <View className={styles.line({ className: 'w-full' })} />
            <View className={styles.line({ className: 'w-2/3' })} />
          </View>
        </View>
      ))}
    </View>
  );
}
