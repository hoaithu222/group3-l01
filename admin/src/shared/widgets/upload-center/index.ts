/**
 * upload-center — thẻ tiến trình neo góc màn hình + store phía sau.
 *
 * Ứng dụng chỉ cần mount MỘT thứ:
 *
 *   <ProgressCenter />   // trong AppProvider
 *
 * rồi màn nghiệp vụ bơm việc vào qua `useUploadQueue().enqueue(...)` (trình
 * duyệt đang ĐẨY tệp lên) hoặc `useImportProgressStore.getState().start(...)`
 * (máy chủ đang CHẠY một việc dài, ta chỉ theo dõi).
 *
 * Hai thành phần con (`UploadQueueCard`, `ImportTaskList`) xuất kèm cho ai muốn
 * đặt thẻ ở chỗ khác — chúng KHÔNG tự neo góc.
 */

export { default as ProgressCenter } from './ProgressCenter';
export { default as UploadQueueCard } from './UploadQueueCard';
export { default as ImportTaskList } from './ImportTaskList';
export type { ImportTaskListProps } from './ImportTaskList';
export { default as ProgressToast } from './progress-toast';
export type { ProgressToastProps, ProgressToastStatus } from './progress-toast';

export { useUploadQueue } from './useUploadQueue';
export type { UploadQueueSummary, UseUploadQueueReturn } from './useUploadQueue';
export { useUploadQueueStore } from './upload-queue.store';

export { useImportProgressStore } from './import-progress.store';
export type {
  ImportProgressPosition,
  ImportProgressStatus,
  ImportProgressTask,
} from './import-progress.store';
