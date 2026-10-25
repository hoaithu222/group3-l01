/**
 * Upload theme — token + tv() recipes cho Upload, FileCard, FileBadge.
 *
 * - `dropzoneStyles` — dropzone variant (dashed border + inner glow). State axis:
 *   `idle` (default) · `dragOver` (highlight cyan) · `error` (red border).
 * - `inlineTriggerStyles` — inline variant (input-like với paperclip icon).
 * - `fileCardStyles` — file row với status axis: `pending` · `uploading` ·
 *   `paused` · `success` · `error`. Status điều khiển màu text trạng thái + viền.
 * - `fileBadgeStyles` — 40px badge icon hiển thị file type. `skin` axis = màu
 *   theo loại file (PDF đỏ, DOCX xanh dương, XLSX xanh lá…).
 * - `progressBarStyles` — track + fill. Fill skin theo status (uploading vàng,
 *   success xanh, error đỏ).
 *
 * Mọi color/font/radius lấy từ token. KHÔNG hex inline.
 */
import { tv, type VariantProps } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';

export const dropzoneStyles = tv(
  {
    slots: {
      root: [
        'relative flex flex-col items-center justify-center gap-3 w-full',
        'border border-dashed transition-colors cursor-pointer outline-none',
        'bg-bg-input',
        'focus-visible:ring-2 focus-visible:ring-ring-focus',
      ],
      // Figma: KHÔNG inset glow. Giữ slot rỗng để compat opacity transition khi dragOver.
      glow: ['pointer-events-none absolute inset-0 transition-opacity'],
      hero: ['inline-flex items-center justify-center text-warning'],
      title: 'text-body-14-medium text-fg-1 text-center',
      description: 'text-caption-12 text-fg-4 text-center',
      actions: 'flex items-center gap-2',
    },
    variants: {
      state: {
        idle: {
          root: 'border-border-1 hover:border-border-2 hover:bg-bg-input-2',
        },
        dragOver: {
          root: 'border-primary-4 bg-primary-1/20',
          glow: 'opacity-100',
        },
        error: {
          root: 'border-error/60 hover:border-error',
        },
        disabled: {
          root: 'opacity-50 cursor-not-allowed hover:border-border-1 hover:bg-bg-input',
        },
      },
      size: {
        sm: { root: 'p-3', hero: 'size-8' },
        md: { root: 'p-4', hero: 'size-10' },
        lg: { root: 'p-6', hero: 'size-12' },
      },
    },
    defaultVariants: { state: 'idle', size: 'md' },
  },
  { twMergeConfig: twMergeFontExtend },
);

export const inlineTriggerStyles = tv(
  {
    slots: {
      root: [
        'group relative inline-flex w-full items-center gap-2 px-3',
        // Figma 264:6671: solid bg + border neutral-8 default. KHÔNG inset shadow.
        'border border-border-1 bg-bg-input transition-colors cursor-pointer outline-none',
        'hover:border-neutral-6',
        'focus-visible:ring-2 focus-visible:ring-ring-focus',
      ],
      icon: 'inline-flex items-center justify-center shrink-0 size-5 text-primary-5',
      label: 'flex-1 min-w-0 text-body-14 truncate',
      trailing: 'inline-flex items-center gap-1 shrink-0 text-fg-4',
    },
    variants: {
      state: {
        idle: { root: 'hover:border-neutral-6', label: 'text-fg-5' },
        filled: { root: 'hover:border-neutral-6', label: 'text-fg-1' },
        error: {
          root: 'border-error/60 hover:border-error',
          label: 'text-fg-1',
        },
        disabled: { root: 'opacity-50 cursor-not-allowed', label: 'text-fg-5' },
      },
      size: {
        sm: { root: 'h-8' },
        md: { root: 'h-9' },
        lg: { root: 'h-10' },
      },
    },
    defaultVariants: { state: 'idle', size: 'md' },
  },
  { twMergeConfig: twMergeFontExtend },
);

export const fileCardStyles = tv(
  {
    slots: {
      root: [
        'relative flex items-center gap-3 w-full',
        // Figma: solid bg-bg-input, KHÔNG inset glow.
        'border bg-bg-input',
      ],
      body: 'flex flex-1 min-w-0 items-center gap-3',
      info: 'flex flex-1 min-w-0 flex-col gap-1',
      name: 'text-body-14-medium text-fg-1 truncate',
      metaRow: 'flex items-center gap-1.5 text-caption-12 text-fg-4',
      metaDivider: 'inline-block h-3 w-px bg-border-1',
      statusGroup: 'inline-flex items-center gap-1 shrink-0',
      statusIcon: 'inline-flex items-center justify-center shrink-0',
      statusText: 'text-caption-12 whitespace-nowrap',
      actions: 'inline-flex items-center gap-2 shrink-0',
      progress: [
        'pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden',
        'bg-bg-2',
      ],
      progressFill: 'block h-full transition-[width] duration-200 ease-out',
    },
    variants: {
      status: {
        pending: {
          root: 'border-border-1',
          statusText: 'text-fg-4',
          progressFill: 'bg-fg-4',
        },
        uploading: {
          root: 'border-border-1',
          statusText: 'text-warning',
          progressFill: 'bg-warning',
        },
        paused: {
          root: 'border-border-1',
          statusText: 'text-warning',
          progressFill: 'bg-warning/60',
        },
        success: {
          root: 'border-border-1',
          statusText: 'text-success',
          progressFill: 'bg-success',
        },
        error: {
          root: 'border-error/40',
          statusText: 'text-error',
          progressFill: 'bg-error',
        },
      },
      density: {
        cozy: { root: 'px-3 py-2.5' },
        compact: { root: 'px-2.5 py-2' },
      },
      // Kiểu thẻ file. `detailed` = badge + meta + progress (mặc định).
      // `simple` = paperclip + tên + xoá (Figma 1365:6787); giữ nguyên nền mặc định.
      variant: {
        detailed: {},
        simple: {},
      },
    },
    defaultVariants: { status: 'pending', density: 'cozy', variant: 'detailed' },
  },
  { twMergeConfig: twMergeFontExtend },
);

export const fileBadgeStyles = tv(
  {
    slots: {
      root: ['relative inline-flex items-center justify-center shrink-0 overflow-hidden'],
      icon: 'absolute inset-0 m-auto',
      label: [
        'absolute bottom-0.5 left-1/2 -translate-x-1/2',
        'px-1 text-[8px] leading-none font-bold tracking-wide',
        'text-neutral-0',
      ],
    },
    variants: {
      skin: {
        red: { root: 'bg-red-1/40 text-red-6', label: 'bg-red-6' },
        blue: { root: 'bg-blue-1/40 text-blue-6', label: 'bg-blue-6' },
        green: { root: 'bg-green-1/40 text-green-6', label: 'bg-green-6' },
        orange: { root: 'bg-yellow-1/40 text-yellow-7', label: 'bg-yellow-7' },
        purple: { root: 'bg-purple-1/40 text-purple-6', label: 'bg-purple-6' },
        sky: { root: 'bg-sky-1/40 text-sky-6', label: 'bg-sky-6' },
        neutral: { root: 'bg-bg-2 text-fg-3', label: 'bg-fg-3' },
      },
      size: {
        sm: { root: 'size-8', icon: 'size-4' },
        md: { root: 'size-10', icon: 'size-5' },
        lg: { root: 'size-12', icon: 'size-6' },
      },
    },
    defaultVariants: { skin: 'neutral', size: 'md' },
  },
  { twMergeConfig: twMergeFontExtend },
);

export const actionButtonStyles = tv(
  {
    base: [
      'inline-flex items-center justify-center shrink-0 size-7',
      'text-fg-4 transition-colors outline-none cursor-pointer',
      'hover:text-fg-1 hover:bg-bg-2',
      'focus-visible:ring-2 focus-visible:ring-ring-focus',
      'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
    ],
    variants: {
      skin: {
        neutral: '',
        danger: 'hover:text-error hover:bg-red-1/40',
        primary: 'hover:text-primary-5 hover:bg-primary-1/40',
      },
    },
    defaultVariants: { skin: 'neutral' },
  },
  { twMergeConfig: twMergeFontExtend },
);

export type DropzoneState = NonNullable<VariantProps<typeof dropzoneStyles>['state']>;
export type DropzoneSize = NonNullable<VariantProps<typeof dropzoneStyles>['size']>;
export type FileCardDensity = NonNullable<VariantProps<typeof fileCardStyles>['density']>;
export type FileCardVariant = NonNullable<VariantProps<typeof fileCardStyles>['variant']>;
export type FileBadgeSkin = NonNullable<VariantProps<typeof fileBadgeStyles>['skin']>;
export type FileBadgeSize = NonNullable<VariantProps<typeof fileBadgeStyles>['size']>;
