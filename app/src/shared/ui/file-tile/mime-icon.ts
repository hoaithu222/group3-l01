import type { IconName } from '../icon';

/**
 * Icon theo MIME của tệp. Tên icon lấy từ bộ icon của repo (`assets/icons/system`) — ảnh `image`, video `play`, âm thanh
 * `audio`, PDF `document`, tài liệu văn bản/bảng tính/trình chiếu `document-2`, còn lại `file-2`.
 * MIME lạ/rỗng ⇒ `file-2` (không bao giờ ném).
 */
export function iconForMime(mime: string | null | undefined): IconName {
  const type = (mime ?? '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'play';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'document';
  if (
    type.startsWith('text/') ||
    type.includes('word') ||
    type.includes('sheet') ||
    type.includes('presentation') ||
    type.includes('powerpoint') ||
    type.includes('excel')
  ) {
    return 'document-2';
  }
  return 'file-2';
}
