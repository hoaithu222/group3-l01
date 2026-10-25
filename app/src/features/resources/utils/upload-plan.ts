import { guessKindFromMime } from '@/core/uploads/mime';
import type { PickedFile } from '@/core/uploads/upload.types';

import { RESOURCE_ERROR_MESSAGES } from '../constants/resource-error-codes.constants';
import { extensionOf, isCodeExtension } from './code-language';

/** MIME mà scope RESOURCE nhận NGUYÊN VĂN cho tệp dạng chữ (README p3-01 §2). */
const TEXT_MIME_KEPT = new Set(['text/plain', 'text/markdown', 'application/json', 'text/csv']);

export interface RejectedFile {
  name: string;
  reason: string;
}

export interface UploadPlan {
  accepted: PickedFile[];
  rejected: RejectedFile[];
}

/**
 * Trình chọn tệp KHÔNG khai MIME ổn định cho mã nguồn: Android trả `.ts` là
 * `video/mp2t`, `.sh` là `application/x-sh`, tệp lạ là `application/octet-stream`.
 * BE nhận mã nguồn là `text/plain` + đuôi thuộc `codeExtensions` — chuẩn hoá ở đây
 * để tệp hợp lệ không bị `ASSET_001` chỉ vì máy khai sai MIME.
 *
 * ⚠️ Chỉ đổi khi ĐUÔI thuộc danh sách mã; đuôi khác giữ nguyên MIME của máy —
 * BE vẫn đọc magic bytes và là nguồn sự thật (ST-01: đổi đuôi ⇒ `REJECTED`).
 */
export function normalizePickedMime(name: string, mime: string): string {
  if (TEXT_MIME_KEPT.has(mime)) return mime;
  return isCodeExtension(extensionOf(name)) ? 'text/plain' : mime;
}

/**
 * Lọc tệp TRƯỚC khi xếp hàng: bỏ tệp rỗng, và (khi biết còn bao nhiêu chỗ) tệp
 * làm tràn hạn mức kho. Chỉ là chặn sớm cho đỡ tốn lượt gọi — BE vẫn kiểm
 * `413 RSC_007` ở `POST /assets`. ⛔ KHÔNG chặn theo dung lượng/MIME ở đây:
 * giới hạn từng loại thuộc BE (video 50 MB vẫn phải lên được).
 *
 * `remainingBytes` chỉ có với OWNER/ADMIN (`GET /storage`); thiếu ⇒ không chặn.
 */
export function planUploads(files: readonly PickedFile[], remainingBytes?: number): UploadPlan {
  const accepted: PickedFile[] = [];
  const rejected: RejectedFile[] = [];
  let budget = remainingBytes;

  files.forEach((file) => {
    if (!Number.isFinite(file.size) || file.size <= 0) {
      rejected.push({ name: file.name, reason: 'Tệp rỗng hoặc không đọc được' });
      return;
    }
    if (budget !== undefined && file.size > budget) {
      rejected.push({ name: file.name, reason: RESOURCE_ERROR_MESSAGES.RSC_007 ?? '' });
      return;
    }
    if (budget !== undefined) budget -= file.size;
    const mime = normalizePickedMime(file.name, file.mime);
    accepted.push({
      ...file,
      mime,
      kind: mime === file.mime ? file.kind : guessKindFromMime(mime),
    });
  });

  return { accepted, rejected };
}
