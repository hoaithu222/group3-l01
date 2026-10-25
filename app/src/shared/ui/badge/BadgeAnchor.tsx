import { type ReactNode } from 'react';
import { View } from 'react-native';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

const badgeAnchor = tv(
  {
    slots: {
      root: 'relative self-start',
      /**
       * Đẩy huy hiệu RA NGOÀI mép 4dp (`-1` = 4dp) để nó cưỡi lên góc thay vì
       * nằm gọn bên trong. Nằm gọn bên trong thì với biểu tượng 24dp, con số
       * che mất gần nửa hình và người dùng không nhận ra đó là biểu tượng gì.
       */
      badge: 'absolute -top-1',
    },
    variants: {
      placement: {
        'top-right': { badge: '-right-1' },
        'top-left': { badge: '-left-1' },
      },
    },
    defaultVariants: { placement: 'top-right' },
  },
  { twMergeConfig },
);

export interface BadgeAnchorProps {
  /** Huy hiệu gắn lên góc. Thường là `<Badge count={…} />` hoặc `<Badge dot />`. */
  badge?: ReactNode;
  className?: string;
  /** Nội dung được gắn huy hiệu — biểu tượng chuông, ô tab, ảnh đại diện… */
  children: ReactNode;
  placement?: 'top-left' | 'top-right';
}

/**
 * Gắn một `Badge` lên góc của nội dung khác.
 *
 * ```tsx
 * <BadgeAnchor badge={<Badge accessibilityLabel="5 thông báo mới" count={5} size="sm" />}>
 *   <Icon name="chat-bubble" />
 * </BadgeAnchor>
 * ```
 *
 * ⛔ `pointerEvents="none"` trên lớp huy hiệu là BẮT BUỘC.
 *
 * Huy hiệu nằm đè lên góc phần tử bên dưới. Không có prop đó thì nó NUỐT cú
 * chạm rơi vào đúng góc ấy — người dùng bấm chuông thông báo ngay chỗ có con số
 * (chỗ tự nhiên nhất để bấm) và không có gì xảy ra. Lỗi này rất khó lần vì bấm
 * chệch sang bên là lại chạy.
 *
 * ⚠️ `overflow` của thẻ cha phải để mặc định (`visible`). Đặt `overflow-hidden`
 * ở đâu đó phía trên là huy hiệu bị cắt cụt mất phần nhô ra ngoài mép.
 */
export function BadgeAnchor({
  badge,
  children,
  className,
  placement = 'top-right',
}: BadgeAnchorProps) {
  const styles = badgeAnchor({ placement });

  return (
    <View className={styles.root({ className })}>
      {children}
      {badge ? (
        <View className={styles.badge()} pointerEvents="none">
          {badge}
        </View>
      ) : null}
    </View>
  );
}
