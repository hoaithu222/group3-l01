import { useToastStore, type ToastType } from '@/shared/ui/feedback/toast-store';

/**
 * Hiện toast từ BẤT KỲ đâu — kể cả ngoài cây component.
 *
 * Chỗ dùng quan trọng nhất là response interceptor của axios
 * (`core/api/client.ts`): nó là code thuần TypeScript, không có hook nào gọi
 * được, nhưng vẫn phải báo lỗi cho người dùng.
 *
 * @example
 *   showToast('success', 'Đã lưu');
 */
export function showToast(type: ToastType, message: string): void {
  useToastStore.getState().show(type, message);
}

export type { ToastType };
