import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import { Icon } from '@/shared/ui/icon';
import { cn, twMergeConfig } from '@/shared/utils/style/cn';

import { COVER_INK, COVER_SURFACE, coverToneFor } from './cover-tone';

const thumb = tv(
  {
    slots: { root: 'items-center justify-center overflow-hidden' },
    variants: {
      // `size-4xl` 40 / `size-6xl` 64 — cùng bậc `size-*` với `IconTile`. Bo `xs` (12) cho ô 40, `sm` (16 — cấp "chip") cho ô 64.
      size: {
        lg: { root: 'size-6xl rounded-sm' },
        sm: { root: 'size-4xl rounded-xs' },
      },
    },
    defaultVariants: { size: 'lg' },
  },
  { twMergeConfig },
);

const GLYPH_SIZE = { lg: 28, sm: 20 } as const;

export interface SetCoverThumbProps extends VariantProps<typeof thumb> {
  className?: string;
  /** Tiêu đề bộ — nguồn của màu nền khi chưa có ảnh (`coverToneFor`). */
  title: string;
  /** `coverThumbUrl` của bộ (ký ≤ 60 s); `null` = chưa có bìa/chưa xử lý xong. */
  uri: string | null;
}

/**
 * Ô bìa vuông của một bộ học ở danh sách/hộp chọn: mảng màu suy từ tiêu đề + icon `book`, ảnh bìa (nếu có) phủ LÊN trên.
 *
 * ── ⚠️ Vì sao xếp LỚP thay vì "ảnh hỏng thì đổi sang ô giữ chỗ" ─────────────────────────────────────────────────────
 * `expo-image` gặp URL hết hạn/404 hoặc mất mạng thì vẽ TRONG SUỐT và im lặng (xem `Thumbnail`/`Avatar`). Ở đây ô màu luôn nằm
 * DƯỚI ảnh: ảnh chưa tải xong hoặc hỏng thì mảng màu tự lộ ra — không cần `onError`, không có khoảnh khắc ô trống. URL của bộ
 * ký ngắn hạn và mỗi lần tải danh sách là một chuỗi mới, nên `cachePolicy="memory"` (không giữ ảnh riêng tư trên đĩa — cùng lý do
 * `StudyAssetImage`). `recyclingKey` để ô được `FlashList` tái dùng không hiện nhầm ảnh của bộ trước.
 *
 * ⚠️ Chỉ TRANG TRÍ: tên bộ đã nằm ở nhãn của hàng bấm được nên cả ô ẩn khỏi trình đọc màn hình.
 */
export function SetCoverThumb({ className, size = 'lg', title, uri }: SetCoverThumbProps) {
  const tone = coverToneFor(title);
  const source = useMemo(() => (uri ? { uri } : undefined), [uri]);

  return (
    <View
      accessibilityElementsHidden
      className={thumb({ size }).root({ className: cn(COVER_SURFACE[tone], className) })}
      importantForAccessibility="no-hide-descendants"
    >
      <Icon color={COVER_INK[tone]} name="book" size={GLYPH_SIZE[size ?? 'lg']} variant="twotone" />
      {source ? (
        <Image
          cachePolicy="memory"
          contentFit="cover"
          recyclingKey={uri ?? undefined}
          source={source}
          style={StyleSheet.absoluteFill}
          transition={160}
        />
      ) : null}
    </View>
  );
}
