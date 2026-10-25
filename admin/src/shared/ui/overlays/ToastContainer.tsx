import { memo } from 'react';
import Toast, { ToastProvider } from './Toast';
import ToastViewport from './ToastViewport';
import { useToastStore } from './toast-store';

/**
 * ToastContainer — mounts Radix ToastProvider + renders all imperative toasts.
 * Place once at app root (ThemeProvider). Consumes useToastStore.
 */
export const ToastContainer = memo(() => {
  const { toasts, remove } = useToastStore();

  return (
    <ToastProvider swipeDirection="right">
      <ToastViewport />
      {toasts.map((item) => (
        <Toast
          key={item.id}
          action={item.action}
          description={item.description}
          duration={item.duration}
          open
          title={item.title}
          type={item.type}
          onOpenChange={(open) => {
            if (!open) remove(item.id);
          }}
        />
      ))}
    </ToastProvider>
  );
});

ToastContainer.displayName = 'ToastContainer';
