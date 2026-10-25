/**
 * `assetId → uri tệp cục bộ` của ảnh MÌNH vừa gửi. Người gửi đã có sẵn file trên máy: vẽ thẳng nó trong bong bóng (cả lúc "đang gửi" lẫn sau khi
 * tin thật về) thay vì hiện khung xương chờ xin URL ký + tải lại chính tấm ảnh mình vừa tải lên. Bộ nhớ thuần, không cần reactive: giá trị được ghi
 * TRƯỚC khi tin thật xuất hiện, và ô ảnh chỉ đọc lúc render.
 */
import type { UploadItem } from '@/core/uploads/upload.types';

import type { PendingPreview } from './outbox.store';

const previews = new Map<string, string>();

/** Ghi nhớ ảnh (`kind IMAGE`, đã có `assetId`) trong các tệp vừa tải xong và trả về danh sách xem trước cho bản tạm outbox. */
export function rememberLocalPreviews(items: UploadItem[]): PendingPreview[] {
  const images = items.filter((item) => item.kind === 'IMAGE' && item.assetId);
  for (const item of images) previews.set(item.assetId as string, item.uri);
  return images.map((item) => ({ uri: item.uri, width: item.width, height: item.height }));
}

export function getLocalPreview(assetId: string): string | undefined {
  return previews.get(assetId);
}

/** File cục bộ không đọc được (đã bị dọn cache) ⇒ quên đi, ô ảnh quay về đường tải từ server. */
export function forgetLocalPreview(assetId: string): void {
  previews.delete(assetId);
}
