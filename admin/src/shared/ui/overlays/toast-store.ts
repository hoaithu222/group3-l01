import { create } from 'zustand';
import type { ToastType } from './Toast';

/** Action button trên toast (vd "Hoàn tác" cho undo delete). */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastStore {
  toasts: ToastItem[];
  /** Push toast vào queue; trả `id` để dismiss/update sau (chuỗi rỗng khi bị dedup). */
  add: (item: Omit<ToastItem, 'id'>) => string;
  /** Cập nhật một phần nội dung toast hiện có (vd: progress message). */
  update: (id: string, patch: Partial<Omit<ToastItem, 'id'>>) => void;
  remove: (id: string) => void;
}

/**
 * Dedup window: 2 toast cùng `type + title` push trong <500ms → skip toast thứ 2.
 * Fix double-toast khi axios interceptor + mutation `onError` cùng show error
 * (vd: interceptor toast "Mã kế hoạch đã tồn tại" + mutation toast lại cùng message).
 * Dedup theo cả `title` lẫn `description` để tránh nuốt toast progress khác title.
 */
const DEDUP_WINDOW_MS = 500;
const recentSignatures = new Map<string, number>();

function isDuplicate(sig: string): boolean {
  const now = Date.now();
  const last = recentSignatures.get(sig);
  // Dọn key cũ để map không phình ra vô hạn.
  for (const [k, t] of recentSignatures) {
    if (now - t > DEDUP_WINDOW_MS * 2) recentSignatures.delete(k);
  }
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) return true;
  recentSignatures.set(sig, now);
  return false;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (item) => {
    const sig = `${item.type}::${item.title}::${item.description ?? ''}`;
    if (isDuplicate(sig)) return '';
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...item, id }] }));
    return id;
  },
  update: (id, patch) =>
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
