import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

/** Nút hành động trong toast — `_button toast` (79×32) của Figma. */
export interface ToastAction {
  label: string;
  onPress: () => void;
}

/**
 * Hai công tắc TUỲ CHỌN của bản vẽ.
 *
 * Trong Figma mỗi symbol toast có sẵn `_button toast` và `icon_ht_cancel`, cả
 * hai để `hidden` mặc định — tức là hai công tắc bật/tắt, không phải hai thành
 * phần cố định. Ghi chú thiết kế (259:97843, nguyên văn): toast "biến mất sau
 * một khoảng thời gian ngắn (5 giây), **hoặc người dùng có thể sử dụng action
 * Đóng (x) (nếu có)**".
 *
 * ⛔ Khai là TUỲ CHỌN, không đổi chữ ký `show()`: tầng gọi API
 * (`core/api/client.ts`) đã gọi `showToast(type, message)` từ trước khi có bộ
 * component, và bắt nó truyền thêm tham số là sửa một file ngoài nhóm này.
 */
export interface ToastOptions {
  /** Nút hành động bên phải — ca dùng chính là "Đã xoá — Hoàn tác". */
  action?: ToastAction;
  /** Hiện nút ✕. Cả dòng vẫn bấm được để đóng, đây chỉ là dấu hiệu NHÌN THẤY. */
  dismissible?: boolean;
}

export interface Toast extends ToastOptions {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  show: (type: ToastType, message: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

/**
 * Bao lâu thì toast tự tắt (ms).
 *
 * 5 giây lấy từ ghi chú thiết kế trong Figma (section `Toast Message`
 * 259:97843, nguyên văn): "biến mất sau một khoảng thời gian ngắn (5 giây)".
 * ⚠️ Đây là số đo của bản thiết kế, không phải con số tuỳ ý — hạ xuống thì câu
 * tiếng Việt dài (toast dài nhất trong thiết kế là 3 dòng) chưa đọc xong đã tắt.
 */
const AUTO_DISMISS_MS = 5_000;

/**
 * Trong khoảng này, cùng một nội dung sẽ KHÔNG hiện thêm lần nữa.
 *
 * Cần thiết vì một thao tác của người dùng thường bắn nhiều request song song
 * (màn hình có 3 thẻ dữ liệu = 3 query). Mất mạng thì cả 3 cùng hỏng cùng lúc
 * và không gộp thì người dùng thấy ba dòng "Không có kết nối mạng" chồng lên
 * nhau — trông như app đang lỗi nặng, trong khi chỉ là rớt Wi-Fi.
 */
const DEDUPE_WINDOW_MS = 3_000;

/** Số toast hiện cùng lúc tối đa. Màn hình điện thoại rất hẹp. */
const MAX_VISIBLE = 3;

const lastShownAt = new Map<string, number>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

let counter = 0;

/**
 * Kho toast.
 *
 * ⛔ Là một STORE chứ không phải context React, có chủ đích: tầng gọi API
 * (`core/api/client.ts`) phải toast được lỗi, mà nó là code thuần TypeScript
 * nằm ngoài cây component — không `useContext` được. Store cho phép gọi mệnh
 * lệnh từ bất cứ đâu, còn phần hiển thị vẫn là một component bình thường
 * (`ToastHost`) đăng ký nghe store.
 *
 * ⚠️ `showToast()` ở `shared/utils/toast.utils.ts` chỉ chuyển tiếp hai tham số
 * đầu — cố ý, vì tầng gọi API không bao giờ có "Hoàn tác" để bắn kèm. Cần nút
 * hành động thì gọi thẳng store:
 *
 * ```ts
 * useToastStore.getState().show('success', 'Đã xoá người thụ hưởng', {
 *   action: { label: 'Hoàn tác', onPress: restore },
 *   dismissible: true,
 * });
 * ```
 */
export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],

  show: (type, message, options) => {
    const key = `${type}:${message}`;
    const now = Date.now();
    const previous = lastShownAt.get(key);
    if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return;

    /**
     * ⛔ Dọn khoá quá hạn NGAY tại đây, đừng chỉ dọn trong `clear()`.
     *
     * `clear()` chỉ có test gọi, nên trong app `lastShownAt` chỉ mọc thêm và
     * không bao giờ co lại. Mỗi nội dung khác nhau là một khoá mới, mà thông
     * báo của ngân hàng có mã giao dịch nhúng trong câu ("Giao dịch 82671357536
     * thành công") ⇒ mỗi lần chuyển tiền là một khoá vĩnh viễn. Rò rỉ chậm
     * nhưng KHÔNG có trần, và phiên dùng app của khách hàng doanh nghiệp kéo
     * dài cả buổi.
     *
     * ⚠️ Quét cả Map là chấp nhận được: nó chỉ chạy khi có toast MỚI được nhận
     * (vài lần mỗi phút, sau khi cửa gộp trùng đã chặn bớt), và số khoá còn
     * sống luôn ≈ số toast trong 3 giây gần nhất.
     */
    for (const [staleKey, shownAt] of lastShownAt) {
      if (now - shownAt >= DEDUPE_WINDOW_MS) lastShownAt.delete(staleKey);
    }
    lastShownAt.set(key, now);

    counter += 1;
    const id = `toast-${counter}`;

    set((state) => ({
      toasts: [...state.toasts, { id, message, type, ...options }].slice(-MAX_VISIBLE),
    }));

    timers.set(
      id,
      setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS),
    );
  },

  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) {
      // Dọn hẹn giờ khi người dùng tự đóng — nếu không thì lượt hẹn cũ vẫn nổ
      // và có thể xoá nhầm một toast MỚI đã tái dùng vị trí đó.
      clearTimeout(timer);
      timers.delete(id);
    }
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },

  clear: () => {
    timers.forEach(clearTimeout);
    timers.clear();
    lastShownAt.clear();
    set({ toasts: [] });
  },
}));
