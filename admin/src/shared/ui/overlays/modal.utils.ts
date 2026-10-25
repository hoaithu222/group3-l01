import { useCallback } from 'react';

/**
 * Selector cho phần tử focusable đầu tiên trong form.
 * - Text input / textarea / select / masked / password
 * - Radix DatePicker/Dropdown/Popover trigger (button có role/aria-haspopup)
 * - Nút submit KHÔNG nằm trong danh sách — luôn bỏ qua để user không rơi vào
 *   "Xác nhận" ngay khi mở modal (accidentally submit trên Enter).
 */
const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([aria-hidden="true"])',
  'textarea:not([disabled]):not([aria-hidden="true"])',
  'select:not([disabled]):not([aria-hidden="true"])',
  '[role="combobox"]:not([disabled]):not([aria-hidden="true"])',
  '[data-radix-collection-item]:not([disabled])',
  'button[aria-haspopup]:not([disabled]):not([aria-hidden="true"])',
].join(',');

const SKIP_ATTR = 'data-modal-autofocus-skip';

/**
 * Tìm phần tử input đầu tiên đáng focus trong modal container. Ưu tiên:
 * 1. Element có `data-autofocus` (opt-in explicit)
 * 2. Nếu không có → input/textarea/select/combobox đầu tiên visible + không disabled
 *
 * Bỏ qua element có `data-modal-autofocus-skip` (vd close button, decorative).
 * Bỏ qua nút submit (nút footer type="submit") — tránh Enter accidental submit.
 */
export function focusFirstFormInput(container: HTMLElement | null): boolean {
  if (!container) return false;

  const explicit = container.querySelector<HTMLElement>('[data-autofocus="true"]:not([disabled])');
  if (explicit) {
    explicit.focus();
    return true;
  }

  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  for (const el of candidates) {
    if (el.getAttribute(SKIP_ATTR) === 'true') continue;
    if (el.getAttribute('type') === 'submit') continue;
    // Skip element nằm trong footer (button submit/cancel wrapper)
    if (el.closest('[data-modal-footer="true"]')) continue;
    // Skip hidden bằng CSS
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
    el.focus();
    // Text input → move caret cuối để user gõ tiếp; select nội dung nếu ngắn.
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const len = el.value?.length ?? 0;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // input type=number/date không hỗ trợ setSelectionRange — bỏ qua.
      }
    }
    return true;
  }
  return false;
}

/**
 * Chuyển focus vào ô nhập đầu tiên khi lớp nổi mở ra.
 *
 * Radix mặc định focus vào chính panel, nên người dùng luôn phải bấm/Tab thêm
 * một nhịp mới gõ được. `preventDefault()` rồi tự tìm ô nhập đầu tiên.
 *
 * Chờ một khung hình trước khi tìm: Radix dựng thân panel TRƯỚC khi bắn sự
 * kiện, nhưng field của react-hook-form có thể mount bất đồng bộ (`defaultValues`
 * là promise) — tìm ngay thì chưa có gì để focus.
 *
 * `preferForm` cho `FormModal`: tìm bên trong `<form>` để bỏ qua phần chrome
 * (nút đóng ở header) vốn đứng trước ô nhập trong thứ tự DOM.
 */
export function useOpenAutoFocus(
  contentRef: React.RefObject<HTMLElement | null>,
  {
    enabled,
    onOpenAutoFocus,
    preferForm = false,
  }: {
    enabled: boolean;
    onOpenAutoFocus?: (event: Event) => void;
    preferForm?: boolean;
  },
) {
  return useCallback(
    (event: Event) => {
      if (onOpenAutoFocus) {
        onOpenAutoFocus(event);
        return;
      }
      if (!enabled) return;
      event.preventDefault();
      requestAnimationFrame(() => {
        const container = contentRef.current;
        if (!container) return;
        const target = preferForm
          ? (container.querySelector<HTMLElement>('form') ?? container)
          : container;
        focusFirstFormInput(target);
      });
    },
    [contentRef, enabled, onOpenAutoFocus, preferForm],
  );
}
