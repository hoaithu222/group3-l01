import { toErrorMessage } from '@/core/api/client.helpers';

import { getErrorCode } from './error-details';

/**
 * Câu lỗi khi SAO CHÉP thẻ. Mã nghiệp vụ đã có câu chung (`task-error-codes.constants.ts`: `TASK_010` bảng đủ thẻ, `TASK_001` cột không còn,
 * `VAL_001`…) — chỉ `TASK_002` cần câu riêng: ở BE nó nghĩa là "cột đích là Hoàn thành mà bảng bật chấm chéo" (thẻ mới không thể sinh ra đã ở
 * cột xong), còn câu chung "Thẻ chưa đủ điều kiện để hoàn thành" đọc lên khó hiểu với người chỉ bấm "Nhân bản".
 */
export function duplicateTaskErrorMessage(error: unknown): string {
  if (getErrorCode(error) === 'TASK_002') {
    return 'Bảng đang bật chấm chéo nên không tạo thẻ mới thẳng vào cột Hoàn thành được. Hãy chọn cột khác.';
  }
  return toErrorMessage(error);
}
