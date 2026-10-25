import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

import { coverAngle, coverFaceOpacity, spineFrame, type BookGeometry } from './book-geometry';

export type BookCoverSide = 'front' | 'inside';

/**
 * `backfaceVisibility` đặt lên CHÍNH khung xoay — đặt lên con thì vô tác dụng vì con bị ép phẳng vào mặt phẳng của cha
 * (xem "Bìa quá 90°" ở `book-geometry.ts`).
 */
const HIDDEN_BACKFACE = { backfaceVisibility: 'hidden' } as const;

/**
 * Bìa cứng tông thương hiệu. Mặt trong bo mép TRÁI (mép tự do khi đã lật sang trái) và có tờ lót (`surface-primary`) chừa
 * viền bìa `inset` ôm quanh — y như sách bìa cứng thật: mở ra thấy một đường viền màu bìa quanh ruột.
 */
const cover = tv(
  {
    slots: { board: 'bg-action-base', endpaper: 'absolute bg-surface-primary' },
    variants: {
      side: {
        front: { board: 'rounded-r-2xs' },
        inside: { board: 'rounded-l-2xs', endpaper: 'rounded-l-3xs' },
      },
    },
  },
  { twMergeConfig },
);

export interface BookCoverFaceProps {
  /** Hình trên mặt ngoài (logo). Mặt trong không có. */
  children?: ReactNode;
  geometry: BookGeometry;
  progress: SharedValue<number>;
  /** Bóng đổ khi nằm phẳng — chỉ mặt trong cần (mặt ngoài lúc gập đã trùng bìa sau, bìa sau mang bóng). */
  shadow?: ViewStyle['boxShadow'];
  side: BookCoverSide;
}

/**
 * Một mặt của bìa trước. Góc θ = 180°·`progress`; mặt ngoài `rotateY(−θ)`, mặt trong `rotateY(180° − θ)` — hai khung anh em
 * cùng đi một quỹ đạo, `opacity` đổi mặt đúng lúc bìa dựng đứng (90°).
 *
 * ⛔ `Animated.View` mang `useAnimatedStyle` KHÔNG mang `className` và phải `cssInterop={false}`; `collapsable={false}` để
 * Fabric không "làm phẳng" khung chỉ có transform (Reanimated mất view để cập nhật).
 */
export function BookCoverFace({ children, geometry, progress, shadow, side }: BookCoverFaceProps) {
  const { boardH, boardW, inset, perspective } = geometry;
  const styles = cover({ side });
  const front = side === 'front';

  const style = useAnimatedStyle(() => {
    const value = progress.get();
    const angle = coverAngle(value);
    return {
      opacity: coverFaceOpacity(value, side),
      transform: [{ perspective }, { rotateY: `${front ? -angle : 180 - angle}deg` }],
    };
  });

  return (
    <Animated.View
      collapsable={false}
      cssInterop={false}
      style={[spineFrame(boardW, boardH, geometry), HIDDEN_BACKFACE, style]}
    >
      {/* Mặt ngoài ở nửa PHẢI khung 2W (`left = boardW`), mặt trong ở nửa TRÁI (`left = 0`). */}
      <View
        className={styles.board()}
        style={{
          boxShadow: shadow,
          height: boardH,
          left: front ? boardW : 0,
          position: 'absolute',
          top: 0,
          width: boardW,
        }}
      >
        {front ? (
          children
        ) : (
          // Tờ lót trùng đúng chỗ ruột sách nằm khi mở (lệch gáy 0, ba mép còn lại chừa `inset`).
          <View
            className={styles.endpaper()}
            style={{ bottom: inset, left: inset, right: 0, top: inset }}
          />
        )}
      </View>
    </Animated.View>
  );
}
