import { Image } from 'expo-image';
import { View } from 'react-native';
import { tv } from 'tailwind-variants';

import { RADIUS } from '@/shared/theme';
import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Rãnh bản lề sát gáy (một nét `action-tint-strong` mờ) — chi tiết khiến một khối bo góc đọc ra ngay là BÌA SÁCH cứng chứ
 * không phải một thẻ tím. Logo ngồi trên một "nhãn" `surface-primary` (cùng đĩa lót của hình đầu màn cũ): nền ảnh logo là
 * gradient tím–navy ĐẶC, đặt thẳng lên bìa `action-base` (cũng tím) thì hai mảng tím dính vào nhau.
 * ⛔ Hình vẽ trên nền `action-*` không dùng `neutral-0`/`white-*` (tối đo 1.95:1, biến mất — `shared/ui/AGENTS.md`).
 */
const art = tv(
  {
    slots: {
      root: 'flex-1 items-center justify-center',
      hinge: 'absolute inset-y-0 w-px bg-action-tint-strong opacity-60',
      plate: 'bg-surface-primary',
    },
    variants: {
      compact: {
        true: { hinge: 'left-1', plate: 'rounded-xs p-0.5' },
        false: { hinge: 'left-2', plate: 'rounded-sm p-1' },
      },
    },
  },
  { twMergeConfig },
);

export interface BookCoverArtProps {
  compact: boolean;
  /** Cạnh ảnh logo (dp) — theo `BookGeometry.logo`. */
  logo: number;
}

/**
 * Mặt ngoài bìa trước: rãnh bản lề + logo thương hiệu.
 *
 * ⚠️ `expo-image` KHÔNG nhận `className` (cỡ gán qua class bị bỏ qua ÂM THẦM, ảnh cao 0 — cùng bẫy ở `Avatar.tsx`) ⇒ cỡ + bo
 * góc đi thẳng `style`. Bo ĐỒNG TÂM với nhãn: 12 + đệm 4 = 16 (`rounded-sm`); bản nhỏ 8 + 2 ≈ 12 (`rounded-xs`).
 */
export function BookCoverArt({ compact, logo }: BookCoverArtProps) {
  const styles = art({ compact });
  const logoStyle = {
    borderRadius: compact ? RADIUS['2xs'] : RADIUS.xs,
    height: logo,
    width: logo,
  };

  return (
    <View className={styles.root()}>
      <View className={styles.hinge()} />
      <View className={styles.plate()}>
        <Image
          contentFit="cover"
          source={require('@/assets/images/brand-logo.png')}
          style={logoStyle}
        />
      </View>
    </View>
  );
}
