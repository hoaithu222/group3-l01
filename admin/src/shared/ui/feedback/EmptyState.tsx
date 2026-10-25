/**
 * EmptyState — kit2 "no data" placeholder.
 *
 * Two rendering modes:
 *   1. Icon mode  (default) — wraps a BoldSystemIcon in a tinted circle.
 *   2. Illustration mode   — renders a custom ReactNode (e.g. <TableEmptyIllustration />)
 *      directly, without the circle wrapper.
 *
 * Examples:
 *   // Icon mode
 *   <EmptyState
 *     icon="inbox-bold"
 *     title="Chưa có dữ liệu"
 *     description="Tạo task đầu tiên để bắt đầu"
 *     action={<Button variant="primary">Tạo task</Button>}
 *   />
 *
 *   // Illustration mode
 *   <EmptyState
 *     illustration={<TableEmptyIllustration accentColor="sky" />}
 *     title="Chưa có dữ liệu"
 *     description="Thêm dữ liệu để hiển thị bảng"
 *   />
 *
 *   // Custom icon node — icon/title/description đều nhận ReactNode
 *   <EmptyState
 *     icon={<SystemIcon name="magnifying-glass-outline" size={40} className="text-fg-4" />}
 *     title={<>Không tìm thấy <b>kết quả</b></>}
 *     description="Thử từ khoá khác"
 *   />
 *
 * Size axis controls gap density and text scale; in illustration mode the icon
 * wrapper is omitted — illustration controls its own dimensions.
 */

import { tv, type VariantProps } from 'tailwind-variants';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import Heading from '@/shared/ui/primitives/Heading';
import Text from '@/shared/ui/primitives/Text';
import type { BoldSystemIconName } from '@/shared/ui/surfaces/SummaryCard';

const emptyStateStyles = tv(
  {
    slots: {
      root: 'flex w-full flex-col items-center justify-center text-center',
      iconWrap: 'flex items-center justify-center bg-bg-2/60',
      illustrationWrap: 'flex items-center justify-center',
      title: '',
      description: 'max-w-md',
      actionWrap: '',
    },
    variants: {
      size: {
        sm: {
          root: 'gap-2 p-4',
          iconWrap: 'h-10 w-10',
          illustrationWrap: '',
          actionWrap: 'mt-1',
        },
        md: {
          root: 'gap-3 p-6',
          iconWrap: 'h-14 w-14',
          illustrationWrap: '',
          actionWrap: 'mt-2',
        },
        lg: {
          root: 'gap-4 p-8',
          iconWrap: 'h-20 w-20',
          illustrationWrap: '',
          actionWrap: 'mt-3',
        },
      },
    },
    defaultVariants: { size: 'md' },
  },
  { twMergeConfig: twMergeFontExtend },
);

const ICON_COLOR_CLASS = {
  neutral: 'text-fg-4',
  primary: 'text-primary-5',
  sky: 'text-sky-5',
  yellow: 'text-yellow-5',
  red: 'text-red-5',
  green: 'text-green-5',
} as const;

export type EmptyStateIconColor = keyof typeof ICON_COLOR_CLASS;

const ICON_PX = { sm: 20, md: 28, lg: 36 } as const;
const TITLE_SIZE = { sm: 'extraTiny', md: 'tiny', lg: 'small' } as const;
const DESC_SIZE = { sm: 'extraTiny', md: 'tiny', lg: 'small' } as const;

type EmptyStateRecipeVariants = VariantProps<typeof emptyStateStyles>;
export type EmptyStateSize = NonNullable<EmptyStateRecipeVariants['size']>;

export interface EmptyStateProps {
  /**
   * Icon hiển thị phía trên. Hai dạng:
   *   - `BoldSystemIconName` (string) — render `<SystemIcon>` trong vòng tròn tinted.
   *   - `React.ReactNode` — render node tuỳ ý trực tiếp (không vòng tròn), vd
   *     `<SystemIcon name="folder-outline" size={40} />` hoặc `<Image ... />`.
   * Bỏ qua khi `illustration` được set.
   */
  icon?: BoldSystemIconName | React.ReactNode;
  /** Icon tint color — chỉ áp dụng khi `icon` là tên system-icon (string). */
  iconColor?: EmptyStateIconColor;
  /**
   * Custom illustration rendered directly (no circle wrapper).
   * When provided, `icon` and `iconColor` props are ignored.
   * Example: `<TableEmptyIllustration accentColor="sky" />`
   */
  illustration?: React.ReactNode;
  title: React.ReactNode;
  /** Override typography/spacing của title (vd thu nhỏ chữ: "text-caption-12"). */
  titleClassName?: string;
  description?: React.ReactNode;
  /** Optional CTA node rendered below the description. */
  action?: React.ReactNode;
  size?: EmptyStateSize;
  className?: string;
}

function EmptyState({
  icon = 'inbox-bold',
  iconColor = 'neutral',
  illustration,
  title,
  titleClassName,
  description,
  action,
  size = 'sm',
  className,
}: EmptyStateProps) {
  const slots = emptyStateStyles({ size });
  // string → icon name (SystemIcon + vòng tròn); ReactNode khác → render trực tiếp.
  const isIconName = typeof icon === 'string';

  return (
    <div className={cn(slots.root(), className)} role="status">
      {illustration ? (
        <div className={slots.illustrationWrap()}>{illustration}</div>
      ) : isIconName ? (
        <div className={slots.iconWrap()}>
          <SystemIcon
            className={ICON_COLOR_CLASS[iconColor]}
            name={icon as BoldSystemIconName}
            size={ICON_PX[size]}
          />
        </div>
      ) : (
        icon && <div className={slots.illustrationWrap()}>{icon}</div>
      )}

      <Heading className={cn(slots.title(), titleClassName)} size={TITLE_SIZE[size]}>
        {title}
      </Heading>

      {description && (
        <Text className={slots.description()} size={DESC_SIZE[size]} skin="muted">
          {description}
        </Text>
      )}

      {action && <div className={slots.actionWrap()}>{action}</div>}
    </div>
  );
}

export default EmptyState;
