import { MAX_PINNED_MODULES, useModulePinsStore, type TogglePinResult } from './module-pins.store';

export interface PinFeedback {
  message: string;
  /** Khớp `ToastType` — `info` cho việc bị chặn, `success` cho việc đã làm. */
  tone: 'info' | 'success';
}

/** Câu phản hồi cho một kết quả bật/tắt ghim. `not-ready` không có gì để nói (chưa làm gì cả). */
export function pinFeedback(result: TogglePinResult, title: string): PinFeedback | null {
  switch (result) {
    case 'pinned':
      return { message: `Đã ghim ${title} lên đầu Trang chủ`, tone: 'success' };
    case 'unpinned':
      return { message: `Đã bỏ ghim ${title}`, tone: 'success' };
    case 'full':
      return {
        message: `Chỉ ghim được ${String(MAX_PINNED_MODULES)} phân hệ lên đầu Trang chủ. Bỏ ghim bớt rồi thử lại.`,
        tone: 'info',
      };
    case 'not-ready':
      return null;
  }
}

/**
 * Bật/tắt ghim một phân hệ — MỘT cửa cho Trang chủ (nhấn giữ) và `ModulePickerSheet` (nút ghim).
 *
 * Chặn trần ở tầng store chứ không để nơi gọi tự đếm: hai nơi tự đếm là hai bộ luật, và thế nào cũng có lúc lệch.
 * Chỉ trả kết quả; PHẢN HỒI (toast / thông báo trong tấm) do nơi gọi chọn — `<Modal>` của tấm chọn phân hệ che mất toast.
 */
export function toggleModulePin(moduleId: string, availableIds: readonly string[]): TogglePinResult {
  return useModulePinsStore.getState().toggle(moduleId, availableIds);
}
