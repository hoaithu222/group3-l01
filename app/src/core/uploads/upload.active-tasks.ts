/**
 * Registry các tác vụ tải NATIVE đang chạy (`UploadTask`/`AbortController`).
 *
 * ⚠️ Tách khỏi `upload.store` (Zustand) có chủ đích: hàm huỷ không tuần tự hoá
 * được và không phải "dữ liệu hiển thị" — nhét vào state Zustand chỉ mời gọi
 * ai đó `JSON.stringify` state để debug rồi vấp một hàm không serialize được.
 *
 * File riêng (không gộp vào `upload.runner.ts`) để `upload.pipeline.ts` dùng
 * được MÀ KHÔNG import ngược `upload.runner.ts` — tránh vòng import giữa hai
 * file cùng lo một việc (runner lên lịch, pipeline chạy từng item).
 */
const cancelHandles = new Map<string, () => void>();

export function registerCancel(localId: string, cancel: () => void): void {
  cancelHandles.set(localId, cancel);
}

/** Gọi hàm huỷ đã đăng ký (nếu còn) rồi xoá khỏi registry. */
export function cancelTask(localId: string): void {
  cancelHandles.get(localId)?.();
  cancelHandles.delete(localId);
}

export function clearTask(localId: string): void {
  cancelHandles.delete(localId);
}
