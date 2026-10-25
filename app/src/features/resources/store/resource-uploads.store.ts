import { create } from 'zustand';

/**
 * Bước "thêm vào kho" SAU khi asset `READY`: `awaiting` (chờ) → `creating`
 * (`POST /resources` đang bay) → `created` | `failed`.
 */
export type FinalizePhase = 'awaiting' | 'created' | 'creating' | 'failed';

export interface UploadTarget {
  errorCode?: string;
  /** `null` = thư mục gốc. Ghi LÚC XẾP HÀNG — người dùng có thể rời thư mục đó trước khi tải xong. */
  folderId: string | null;
  /** Sinh 1 lần/tệp (app.md §4) — thử lại `POST /resources` không tạo bản thứ hai. */
  idempotencyKey: string;
  phase: FinalizePhase;
  resourceId?: string;
  workspaceId: string;
}

interface ResourceUploadsShape {
  clearWorkspace: (workspaceId: string) => string[];
  patchTarget: (localId: string, patch: Partial<UploadTarget>) => void;
  removeTarget: (localId: string) => void;
  reset: () => void;
  setTarget: (localId: string, target: UploadTarget) => void;
  targets: Record<string, UploadTarget>;
}

/**
 * Bảng phụ `localId → đích` của hàng đợi tải lên Resource Hub.
 *
 * ⚠️ Tồn tại vì `UploadItem` của `core/uploads` (p0-05) không có chỗ ghi "tệp này
 * sẽ vào thư mục nào" và "đã tạo Resource chưa". Cố ý KHÔNG sửa `UploadItem`
 * thêm trường riêng của một feature — hàng đợi chung vẫn là nguồn sự thật cho
 * tiến độ/trạng thái tải; bảng này chỉ giữ phần của Resource Hub. Zustand thuần,
 * không persist (hàng đợi upload cũng không persist — p0-05 app.md §5).
 */
export const useResourceUploadStore = create<ResourceUploadsShape>((set, get) => ({
  targets: {},

  setTarget: (localId, target) =>
    set((state) => ({ targets: { ...state.targets, [localId]: target } })),

  patchTarget: (localId, patch) =>
    set((state) => {
      const current = state.targets[localId];
      if (!current) return state;
      return { targets: { ...state.targets, [localId]: { ...current, ...patch } } };
    }),

  removeTarget: (localId) =>
    set((state) => {
      const next = { ...state.targets };
      delete next[localId];
      return { targets: next };
    }),

  /** Xoá mọi đích của một workspace (mất quyền) — trả `localId` đã xoá để nơi gọi dọn nốt hàng đợi chung. */
  clearWorkspace: (workspaceId) => {
    const removed = Object.entries(get().targets)
      .filter(([, target]) => target.workspaceId === workspaceId)
      .map(([localId]) => localId);
    set((state) => {
      const next = { ...state.targets };
      removed.forEach((id) => delete next[id]);
      return { targets: next };
    });
    return removed;
  },

  reset: () => set({ targets: {} }),
}));
