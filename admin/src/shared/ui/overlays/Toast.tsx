import { forwardRef } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { tv } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { SystemIconName } from '@/shared/ui/icons';

/**
 * Toast — kit2 notification (Figma 469:4791) built on Radix Toast primitives.
 *
 * Setup once at app root:
 *   <ToastProvider>
 *     {app}
 *     <ToastViewport />
 *   </ToastProvider>
 *
 * Then render Toast instances (controlled or uncontrolled):
 *   <Toast open={open} onOpenChange={setOpen} type="success" title="Saved" />
 *
 * Radix gives us: live-region announcement, swipe-to-dismiss, auto-dismiss
 * duration, focus management, and the Close primitive for keyboard a11y.
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

const ICON_MAP: Record<ToastType, SystemIconName> = {
  success: 'circle-check-outline',
  error: 'circle-xmark-outline',
  warning: 'triangle-exclamation-outline',
  info: 'circle-exclamation-outline',
};

const styles = tv(
  {
    slots: {
      root: [
        'relative inline-flex items-center gap-4 w-full max-w-[400px] overflow-hidden',
        'p-3',
        'border border-white/20',
        'shadow-[0_0_20px_0_var(--color-neutral-10)]',
        'backdrop-blur-[10px]',
        // Radix data-state enter/exit transitions
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
        'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform',
        'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
      ],
      inner: 'flex items-center gap-3 flex-1 min-w-0',
      iconWrap: 'shrink-0 inline-flex items-center justify-center p-1.5 rounded-full',
      icon: 'size-4',
      // select-text/cursor-text đè `user-select: none` mà Radix gắn inline lên
      // <li> gốc — user bôi đen & copy được nội dung thông báo.
      body: 'flex flex-col gap-1 flex-1 min-w-0 leading-5 select-text cursor-text',
      title: 'text-body-14-medium text-neutral-0 break-words',
      description: 'text-body-14 text-fg-3 break-words',
      close: [
        'shrink-0 inline-flex items-center justify-center size-5 cursor-pointer',
        'text-fg-3 hover:text-neutral-0 transition-colors outline-none',
        'focus-visible:ring-1 focus-visible:ring-primary-5',
      ],
    },
    variants: {
      // bg = linear-gradient(90deg, <type-color>-6/20 20%, azure-6/20 100%)
      // alpha 20% expressed via color-mix to work inside arbitrary CSS value.
      type: {
        success: {
          root: 'bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-green-6)_20%,transparent)_20%,color-mix(in_srgb,var(--color-azure-6)_20%,transparent)_100%)]',
          iconWrap: 'bg-green-6/20',
          icon: 'text-green-6',
        },
        error: {
          root: 'bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-red-6)_20%,transparent)_20%,color-mix(in_srgb,var(--color-azure-6)_20%,transparent)_100%)]',
          iconWrap: 'bg-red-6/20',
          icon: 'text-red-6',
        },
        warning: {
          root: 'bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-yellow-6)_20%,transparent)_20%,color-mix(in_srgb,var(--color-azure-6)_20%,transparent)_100%)]',
          iconWrap: 'bg-yellow-6/20',
          icon: 'text-yellow-6',
        },
        info: {
          root: 'bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-blue-6)_20%,transparent)_20%,color-mix(in_srgb,var(--color-azure-6)_20%,transparent)_100%)]',
          iconWrap: 'bg-blue-6/20',
          icon: 'text-blue-6',
        },
      },
    },
  },
  { twMergeConfig: twMergeFontExtend },
);

/**
 * Chặn Radix bắt đầu "vuốt để đóng" khi user kéo CHUỘT để bôi đen chữ.
 * Radix gắn `onPointerDown` trên <li> gốc và chỉ cần lệch 2px là cướp pointer
 * (`setPointerCapture`) → mất vùng chọn. Chặn nổi bọt ở vùng chữ là đủ; chạm
 * (touch/pen) vẫn vuốt được như cũ, và vuốt từ icon/lề toast cũng vậy.
 */
const stopMouseSwipe = (e: React.PointerEvent<HTMLDivElement>) => {
  if (e.pointerType === 'mouse') e.stopPropagation();
};

/** Action inline trên toast (vd "Hoàn tác"). Auto-dismiss toast khi click. */
export interface ToastActionSpec {
  label: string;
  onClick: () => void;
}

export interface ToastProps extends Omit<
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root>,
  'title' | 'type'
> {
  type?: ToastType;
  title: string;
  description?: string;
  /** Show the close (X) button. Default true. */
  closable?: boolean;
  /** Action inline (vd Hoàn tác cho undo). Click → onClick fire → toast dismiss. */
  action?: ToastActionSpec;
}

const Toast = forwardRef<React.ComponentRef<typeof ToastPrimitive.Root>, ToastProps>(
  ({ type = 'info', title, description, closable = true, action, className, ...rest }, ref) => {
    const slots = styles({ type });

    return (
      <ToastPrimitive.Root ref={ref} className={slots.root({ class: className })} {...rest}>
        <div className={slots.inner()}>
          <span className={slots.iconWrap()}>
            <SystemIcon className={slots.icon()} name={ICON_MAP[type]} />
          </span>
          <div className={slots.body()} onPointerDown={stopMouseSwipe}>
            <ToastPrimitive.Title className={slots.title()}>{title}</ToastPrimitive.Title>
            {description && (
              <ToastPrimitive.Description className={slots.description()}>
                {description}
              </ToastPrimitive.Description>
            )}
          </div>
        </div>
        {action && (
          <ToastPrimitive.Action altText={action.label} asChild onClick={action.onClick}>
            <button
              className="mr-1 shrink-0 rounded-md px-2.5 py-1 text-caption-12-bold text-primary-5 transition-colors hover:bg-primary-5/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-5"
              type="button"
            >
              {action.label}
            </button>
          </ToastPrimitive.Action>
        )}
        {closable && (
          <ToastPrimitive.Close aria-label="Đóng" className={slots.close()}>
            <SystemIcon className="size-5" name="xmark-outline" />
          </ToastPrimitive.Close>
        )}
      </ToastPrimitive.Root>
    );
  },
);

Toast.displayName = 'Toast';

/** Re-export of Radix Toast.Provider — wrap your app once. */
export const ToastProvider = ToastPrimitive.Provider;

export default Toast;
