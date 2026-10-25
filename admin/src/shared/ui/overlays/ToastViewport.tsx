import { forwardRef } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cn } from '@/shared/utils/style/cn';

/**
 * ToastViewport — visible mount point for all Toasts.
 *
 * Place once inside a `ToastProvider` (typically at app root). All `Toast`
 * instances render here via Radix's internal collection.
 *
 * Default position: fixed bottom-right. Override `className` to relocate
 * (e.g. inline within a section, or fixed top-right).
 */
const ToastViewport = forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...rest }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-4 right-4 z-[200] flex flex-col-reverse gap-3 max-w-[420px] w-full outline-none',
      className,
    )}
    {...rest}
  />
));

ToastViewport.displayName = 'ToastViewport';

export default ToastViewport;
