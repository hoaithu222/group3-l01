import type { AxiosError } from 'axios';

import { extractErrorMessage, isErrorHandled } from '@/core/api/error.handler';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import type { ToastType } from '@/shared/ui/overlays/Toast';
import type { ToastAction } from '@/shared/ui/overlays/toast-store';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

export type { ToastType, ToastAction };

interface ToastOptions {
  duration?: number;
  description?: string;
  /** Action button inline (vd "Hoàn tác" cho undo). */
  action?: ToastAction;
}

/**
 * Show toast notification — pushes to kit2 Radix Toast via useToastStore.
 *
 * Trả về `id` để có thể `dismissToast(id)` / `updateToast(id, ...)` sau.
 * Truyền `duration: Infinity` để toast "đang xử lý" KHÔNG tự tắt
 * (vd: import flow chờ SSE complete).
 */
export function showToast(type: ToastType, message: string, options?: ToastOptions): string {
  return useToastStore.getState().add({
    type,
    title: message,
    description: options?.description,
    duration: options?.duration ?? 3000,
    action: options?.action,
  });
}

/** Show toast by BE error code */
export function showToastByCode(code: string, options?: ToastOptions): string {
  const message = ERROR_CODE_MESSAGES[code] ?? 'Đã xảy ra lỗi';
  return showToast('error', message, options);
}

/**
 * Show error toast trong mutation `onError` — tự động skip nếu axios response
 * interceptor đã hiển thị toast cho error này (`__toastShown = true`).
 *
 * Tránh double-toast khi BE trả error code mapped (interceptor show "Mã kế
 * hoạch đã tồn tại") + mutation `onError` show thêm raw "Request failed with
 * status code 400".
 *
 *   onError: (e) => showErrorToast(e, 'Có lỗi khi xóa kế hoạch')
 *
 * @param error   Error object từ mutation.
 * @param fallback Fallback message nếu interceptor chưa toast và BE không trả message.
 */
/**
 * Rút câu thông báo từ MỘT LỖI BẤT KỲ, không chỉ `AxiosError`.
 *
 * ⛔ Bản trước ép kiểu thẳng `extractErrorMessage(error as AxiosError)`. Lỗi
 * không phải của axios thì không có `.response`, mà `extractErrorMessage` lại
 * hiểu "không có response" nghĩa là đứt mạng — nên nó trả về "Không thể kết nối
 * đến máy chủ". Hậu quả cụ thể: `throw new Error('duplicate_code')` — đúng cái
 * pattern mà `docs/rules/form-validation.md §4` DẠY dùng để giữ modal mở khi
 * trùng mã — hiện ra cho người dùng thành lỗi mạng.
 *
 * Và với `null` hay chuỗi thì `error.response` ném luôn TypeError ngay bên
 * trong `onError`, tức là lỗi khi đang xử lý lỗi.
 */
function messageOf(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error.trim() || fallback;
  // Nhận diện AxiosError bằng cờ riêng của axios, không dựa vào `.response` —
  // lỗi mạng thật cũng là AxiosError mà không có `response`.
  if (error && typeof error === 'object' && 'isAxiosError' in error) {
    return extractErrorMessage(error as AxiosError)?.trim() || fallback;
  }
  if (error instanceof Error) return error.message.trim() || fallback;
  return fallback;
}

export function showErrorToast(
  error: unknown,
  fallback = 'Đã xảy ra lỗi',
  options?: ToastOptions,
): string | undefined {
  if (isErrorHandled(error)) return undefined;
  return showToast('error', messageOf(error, fallback), options);
}

/** Đóng toast theo id (dùng cho toast persistent đã `duration: Infinity`). */
export function dismissToast(id: string): void {
  useToastStore.getState().remove(id);
}

interface UpdateToastPatch {
  type?: ToastType;
  title?: string;
  description?: string;
  duration?: number;
}

/** Update nội dung/type của toast hiện có — không tạo toast mới. */
export function updateToast(id: string, patch: UpdateToastPatch): void {
  useToastStore.getState().update(id, patch);
}
