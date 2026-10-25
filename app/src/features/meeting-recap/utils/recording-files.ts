import * as FileSystem from 'expo-file-system/legacy';

/**
 * Tệp bản ghi TẢI VỀ (chỉ chủ trì — app.md §3 "Tải về") nằm trong `cacheDirectory/recordings/` của app, rồi đưa bảng chia sẻ của hệ điều
 * hành để người dùng tự lưu/gửi. ⚠️ `expo-file-system/legacy` (SDK 57 đổi API gốc sang `File`/`Directory`, `createDownloadResumable` của
 * bản gốc NÉM LỖI lúc chạy — cùng lý do `resources/resource-files.ts`, `chat/FileRow`).
 *
 * ⚠️ Dữ liệu cuộc họp riêng tư: `clearRecordingDownloads()` dọn cả thư mục và ĐÃ nối vào luồng rời phiên — bước `meetingRecap` của
 * `wipeUserData()` (`shell/session/wipe-steps.ts`). Hệ điều hành cũng tự dọn cache khi thiếu chỗ.
 */
export const RECORDING_CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}recordings/`;

export interface RecordingDownload {
  /** Dừng và xoá bản dở. */
  cancel: () => Promise<void>;
  promise: Promise<string>;
}

/** Tải URL ký `DOWNLOAD` (60 s — dùng NGAY) về `recordings/<id>.mp4`, báo tiến độ 0..1. */
export function startRecordingDownload(url: string, recordingId: string, onProgress: (ratio: number) => void): RecordingDownload {
  const path = `${RECORDING_CACHE_DIR}${recordingId.replace(/[^\w-]/g, '_')}.mp4`;
  const resumable = FileSystem.createDownloadResumable(url, path, {}, (data) => {
    if (data.totalBytesExpectedToWrite > 0) onProgress(data.totalBytesWritten / data.totalBytesExpectedToWrite);
  });

  const promise = (async () => {
    await FileSystem.makeDirectoryAsync(RECORDING_CACHE_DIR, { intermediates: true });
    const result = await resumable.downloadAsync();
    if (!result || result.status >= 300) throw new Error('Tải bản ghi thất bại. Hãy thử lại.');
    return result.uri;
  })();

  return {
    cancel: async () => {
      try {
        await resumable.pauseAsync();
      } catch {
        // Đã xong hoặc chưa bắt đầu — chỉ cần xoá bản dở.
      }
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
    },
    promise,
  };
}

/** Xoá mọi bản ghi đã tải về máy — không ném lỗi. */
export async function clearRecordingDownloads(): Promise<void> {
  await FileSystem.deleteAsync(RECORDING_CACHE_DIR, { idempotent: true }).catch(() => undefined);
}
