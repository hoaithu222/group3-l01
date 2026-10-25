/**
 * import-progress.store — hàng đợi TÁC VỤ CHẠY DÀI phía máy chủ.
 *
 * Khác `upload-queue.store`: ở đây trình duyệt KHÔNG làm gì cả, nó chỉ theo dõi
 * một việc máy chủ đang chạy (nhập Excel, kết xuất báo cáo, đồng bộ…). Tiến độ
 * do luồng gọi API tự bơm vào qua `update` / `finishSuccess` / `finishError`,
 * nên store không dính vào SSE, WebSocket hay REST cụ thể nào.
 *
 * Vòng đời một task: `processing` → `success` | `error` → (tự đóng hoặc user tắt)
 *
 * Sống ngoài cây React nên panel vẫn hiện khi người dùng đóng modal nhập liệu
 * rồi đi làm việc khác.
 */

import { create } from 'zustand';

export type ImportProgressStatus = 'processing' | 'success' | 'error';

/** Góc màn hình hiển thị thẻ. Mặc định `bottom-right`. */
export type ImportProgressPosition = 'bottom-right' | 'bottom-left';

export interface ImportProgressTask {
  id: string;
  /** Nhãn việc — vd "Nhập vật tư chính (VTC)". */
  label: string;
  /** Tên tệp người dùng gửi lên (nếu có). */
  fileName?: string;
  status: ImportProgressStatus;
  /** Thông điệp hiện tại — cập nhật liên tục trong lúc chạy. */
  message: string;
  /** Tiến độ %, bỏ trống khi máy chủ không trả về. */
  progress?: number;
  /** Mốc tạo — dùng để xếp task mới lên trên. */
  startedAt: number;
  position?: ImportProgressPosition;
  /** Tự đóng sau bao lâu kể từ lúc xong (ms). Bỏ trống → mặc định của panel. */
  autoDismissMs?: number;
}

interface ImportProgressState {
  tasks: ImportProgressTask[];
  /** Mở một task — trả `id` để cập nhật / kết thúc sau. */
  start: (
    init: Omit<ImportProgressTask, 'id' | 'status' | 'startedAt'> &
      Partial<Pick<ImportProgressTask, 'status'>>,
  ) => string;
  update: (id: string, patch: Partial<ImportProgressTask>) => void;
  finishSuccess: (id: string, message: string) => void;
  finishError: (id: string, message: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

let seq = 0;
const nextId = () => `imp-${++seq}`;

export const useImportProgressStore = create<ImportProgressState>((set) => ({
  tasks: [],

  start: (init) => {
    const id = nextId();
    set((s) => ({
      tasks: [
        ...s.tasks,
        { ...init, id, status: init.status ?? 'processing', startedAt: Date.now() },
      ],
    }));
    return id;
  },

  update: (id, patch) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  finishSuccess: (id, message) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status: 'success', message, progress: 100 } : t,
      ),
    })),

  finishError: (id, message) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: 'error', message } : t)),
    })),

  remove: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  clear: () => set({ tasks: [] }),
}));
