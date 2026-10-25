import * as FileSystem from 'expo-file-system/legacy';

import type { ResourceDto, ResourceUrlVariant } from '../api';

/**
 * ⚠️ `expo-file-system/legacy` chứ không phải `expo-file-system`: bản gốc đã đổi
 * sang API `File`/`Directory` ở SDK 57 và `createDownloadResumable` NÉM LỖI lúc
 * chạy nếu gọi từ đó — cùng lý do `core/uploads/upload.transport.ts`.
 */
export const RESOURCE_CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}resources/`;

const UNSAFE_NAME_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

/** Ký tự cấm trong tên tệp (Windows/Android/iOS) + ký tự điều khiển — đếm theo mã để khỏi cần regex chứa ký tự điều khiển. */
function safeChar(char: string): string {
  return UNSAFE_NAME_CHARS.has(char) || char.charCodeAt(0) < 32 ? '_' : char;
}

/**
 * Tên tệp an toàn để ghi xuống đĩa/chia sẻ. Giữ tên gốc (người nhận thấy đúng
 * "Slide tuần 1.pdf") chứ không đặt theo id — nên mỗi tệp ở một THƯ MỤC riêng
 * (`cacheDirFor`) để hai tệp trùng tên không đè nhau.
 */
export function safeFileName(name: string): string {
  const cleaned = Array.from(name).map(safeChar).join('').trim().replace(/^\.+/, '');
  // Cắt từ ĐẦU: giữ phần đuôi (`.pdf`) vì nơi nhận đoán loại tệp theo đuôi.
  const capped = cleaned.length > 100 ? cleaned.slice(-100) : cleaned;
  return capped || 'tep';
}

/** Thư mục cache của MỘT bản tệp (`id` + `version` + biến thể) — đổi nội dung là đổi version nên không dùng nhầm bản cũ. */
export function cacheDirFor(
  resource: Pick<ResourceDto, 'id' | 'version'>,
  variant: ResourceUrlVariant,
): string {
  return `${RESOURCE_CACHE_DIR}${resource.id}-v${resource.version}-${variant}/`;
}

export function cachePathFor(
  resource: Pick<ResourceDto, 'id' | 'name' | 'version'>,
  variant: ResourceUrlVariant,
): string {
  return `${cacheDirFor(resource, variant)}${safeFileName(resource.name)}`;
}

/** URI tệp đã tải hợp lệ (đúng dung lượng) hoặc `null`. Sai dung lượng = tải dở, coi như chưa có. */
export async function findCachedFile(
  resource: Pick<ResourceDto, 'id' | 'name' | 'size' | 'version'>,
  variant: ResourceUrlVariant,
): Promise<string | null> {
  const path = cachePathFor(resource, variant);
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists && info.size === resource.size ? path : null;
  } catch {
    return null;
  }
}

export interface FileDownload {
  /** Dừng và xoá bản dở — gọi khi rời màn giữa chừng. */
  cancel: () => Promise<void>;
  promise: Promise<string>;
}

/** Tải `url` về `path` (tạo thư mục cha), báo tiến độ 0..1. */
export function startDownload(
  url: string,
  path: string,
  onProgress: (ratio: number) => void,
): FileDownload {
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  const resumable = FileSystem.createDownloadResumable(url, path, {}, (data) => {
    if (data.totalBytesExpectedToWrite > 0) {
      onProgress(data.totalBytesWritten / data.totalBytesExpectedToWrite);
    }
  });

  const promise = (async () => {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const result = await resumable.downloadAsync();
    if (!result || result.status >= 300)
      throw new Error(`Tải tệp thất bại (HTTP ${result?.status ?? '??'})`);
    return result.uri;
  })();

  return {
    promise,
    cancel: async () => {
      try {
        await resumable.pauseAsync();
      } catch {
        // Đã xong hoặc chưa bắt đầu — không còn gì để dừng, chỉ cần dọn thư mục.
      }
      await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => undefined);
    },
  };
}

/** Xoá bản tạm của MỘT tệp (mọi biến thể) — gọi khi rời màn xem trước. Không ném lỗi. */
export async function removeResourceCache(
  resource: Pick<ResourceDto, 'id' | 'version'>,
): Promise<void> {
  const variants: ResourceUrlVariant[] = ['original', 'preview', 'download'];
  await Promise.all(
    variants.map((variant) =>
      FileSystem.deleteAsync(cacheDirFor(resource, variant), { idempotent: true }).catch(
        () => undefined,
      ),
    ),
  );
}

/** Xoá toàn bộ tệp tạm (đăng xuất/đổi tài khoản — app.md §5). Không ném lỗi. */
export async function clearResourceCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(RESOURCE_CACHE_DIR, { idempotent: true });
  } catch {
    // Dọn cache là việc phụ — không được làm hỏng luồng đăng xuất.
  }
}
