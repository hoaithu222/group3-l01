import { formatFileSize } from '@/shared/utils/format/file-size.utils';

import { O2O_LIMITS } from '../constants/o2o.constants';

export const PDF_MIME = 'application/pdf';

/**
 * Tệp chọn để in — chỉ PDF (P0, README p6-05 §1) và ≤ 25 MB (`upload.scopeRestrict.PRINT` của BE). Chặn SỚM ở app để người dùng không phải đợi
 * tải lên xong mới biết tệp bị từ chối (`O2O_003`); BE vẫn là nơi chốt. Trả câu lỗi tiếng Việt kèm VIỆC NÊN LÀM, hoặc `null` khi ổn.
 * `mime` đã được `pick-media` chuẩn hoá theo đuôi tệp, nên `.pdf` báo `octet-stream` vẫn qua.
 */
export function validatePrintFile(file: {
  mime: string;
  size: number;
  name: string;
}): string | null {
  if (file.mime !== PDF_MIME) {
    return 'Chỉ in được tệp PDF. Hãy xuất tài liệu sang PDF (Lưu dưới dạng PDF) rồi chọn lại.';
  }
  if (file.size <= 0) return 'Tệp trống. Hãy chọn tệp khác.';
  if (file.size > O2O_LIMITS.fileMaxBytes) {
    return `Tệp lớn hơn ${formatFileSize(O2O_LIMITS.fileMaxBytes)}. Hãy nén hoặc tách tệp rồi chọn lại.`;
  }
  return null;
}
