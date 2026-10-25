import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `PresenceDot`. Bốn tông đúng bảng `AvatarBadgeTone`
 * (`avatar/avatar.styles.ts`) — dùng LẠI cùng bốn token màu để chấm hiện diện
 * và chấm góc avatar không bao giờ lệch màu nhau khi đứng cạnh.
 */
export const presenceDot = tv(
  {
    slots: {
      root: 'flex-row items-center gap-2xs',
      dot: 'rounded-full',
      label: 'text-caption-sm text-fg-2',
    },
    variants: {
      state: {
        ONLINE: { dot: 'bg-success' },
        IDLE: { dot: 'bg-warning' },
        DND: { dot: 'bg-error' },
        OFFLINE: { dot: 'bg-fg-4' },
        HIDDEN: { dot: 'bg-fg-4' },
      },
      size: {
        sm: { dot: 'h-2 w-2' },
        md: { dot: 'h-2.5 w-2.5' },
      },
    },
    defaultVariants: { size: 'sm' },
  },
  { twMergeConfig },
);

type PresenceDotVariants = VariantProps<typeof presenceDot>;

export type PresenceDotSize = NonNullable<PresenceDotVariants['size']>;
