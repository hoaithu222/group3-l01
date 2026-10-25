/**
 * upload-queue.store — hàng đợi TẢI LÊN dùng chung toàn app.
 *
 * ── Khác `useUpload` của kit2 ở chỗ nào ─────────────────────────────────────
 * `useUpload` (`shared/ui/media`) giữ state TRONG component: đóng modal hay đổi
 * route là mất. Đúng cho một ô chọn tệp trong form.
 *
 * Store này ngược lại: sống NGOÀI cây React nên tiến trình vẫn chạy và vẫn hiện
 * khi người dùng đi sang màn khác — đúng cho việc tải hàng chục tệp nặng. Panel
 * `UploadCenter` mount MỘT lần ở app-level và đọc chính store này.
 *
 * ⛔ Dùng LẠI `UploadFile` / `UploadHandler` của `shared/ui/media`, KHÔNG tự
 * định nghĩa bộ trạng thái thứ hai. Bản gốc bên dự án PMS có riêng
 * `creating | uploading | completing | done | error` song song với
 * `pending | uploading | paused | success | error` của kit2 — hai từ vựng cho
 * cùng một khái niệm, và mọi component đọc tiến trình phải map qua map lại.
 *
 * Store KHÔNG biết gọi API nào: caller truyền `uploader` (đúng hợp đồng
 * `UploadHandler`) khi `enqueue`. Nhờ vậy base không dính vào backend cụ thể.
 * Tải lên `/assets` của BE: `enqueue(files, createAssetUploader({ scope }))` từ
 * `@/core/uploads/asset-upload.adapter` — store chỉ ghi thêm `assetId` vào task.
 */

import { create } from 'zustand';

import type { UploadFile, UploadHandler } from '@/shared/ui';
import { generateFileId } from '@/shared/ui/media/upload.utils';

interface UploadQueueState {
  tasks: UploadFile[];
  /** Handler của lần `enqueue` gần nhất — dùng lại khi bấm "Thử lại". */
  uploader: UploadHandler | null;
  /** Đẩy tệp vào hàng đợi và chạy ngay (tuần tự). Trả về id các task vừa tạo. */
  enqueue: (files: File[], uploader: UploadHandler) => string[];
  /** Chạy lại mọi task đang lỗi. */
  retryFailed: () => void;
  /** Huỷ task đang chạy + xoá sạch hàng đợi. */
  cancel: () => void;
  /** Xoá sạch hàng đợi (không huỷ task đang chạy). */
  clear: () => void;
  /** Cập nhật một task (dùng nội bộ bởi runner). */
  patch: (id: string, patch: Partial<UploadFile>) => void;
}

/**
 * Bộ điều phối nằm NGOÀI store: chạy tuần tự từng tệp một.
 *
 * Tuần tự chứ không song song vì đây là tệp nặng — mở 10 kết nối cùng lúc thì
 * mỗi tệp bò một ít, thanh tiến độ nào cũng nhích chậm và người dùng không biết
 * bao giờ xong tệp nào. Một tệp một lúc cho ra tiến độ đọc được.
 */
let running = false;
let controller: AbortController | null = null;

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const { tasks, uploader, patch } = useUploadQueueStore.getState();
      const next = tasks.find((t) => t.status === 'pending');
      if (!next || !uploader) return;

      controller = new AbortController();
      patch(next.id, { status: 'uploading', progress: 0 });
      try {
        const ref = await uploader(next.file as File, {
          onProgress: (percent) => patch(next.id, { progress: Math.round(percent) }),
          signal: controller.signal,
          id: next.id,
          onAssetId: (assetId) => patch(next.id, { assetId }),
        });
        // Handler theo tài sản BE (`core/uploads`) báo `assetId` và trả chính id đó, KHÔNG phải URL —
        // đừng ghi id vào `url`.
        const isAsset = useUploadQueueStore.getState().tasks.some((t) => t.id === next.id && t.assetId);
        patch(next.id, { status: 'success', progress: 100, ...(isAsset ? {} : { url: ref }) });
      } catch (err) {
        // Huỷ tay đã xoá task khỏi store rồi — `patch` khi đó là no-op, nên
        // không cần phân biệt abort với lỗi thật ở đây.
        patch(next.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Tải lên thất bại',
        });
      } finally {
        controller = null;
      }
    }
  } finally {
    running = false;
  }
}

export const useUploadQueueStore = create<UploadQueueState>((set, get) => ({
  tasks: [],
  uploader: null,

  enqueue: (files, uploader) => {
    const created: UploadFile[] = files.map((file) => ({
      id: generateFileId(),
      file,
      name: file.name,
      size: file.size,
      type: file.type.toLowerCase(),
      status: 'pending',
      progress: 0,
    }));
    set((s) => ({ tasks: [...s.tasks, ...created], uploader }));
    void drain();
    return created.map((t) => t.id);
  },

  retryFailed: () => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.status === 'error' ? { ...t, status: 'pending', progress: 0, error: undefined } : t,
      ),
    }));
    void drain();
  },

  cancel: () => {
    controller?.abort();
    set({ tasks: [] });
  },

  clear: () => set({ tasks: [] }),

  patch: (id, patch) => {
    // Task đã bị xoá (người dùng bấm Huỷ giữa chừng) → bỏ qua, KHÔNG hồi sinh
    // nó bằng cách thêm lại vào mảng.
    if (!get().tasks.some((t) => t.id === id)) return;
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  },
}));
