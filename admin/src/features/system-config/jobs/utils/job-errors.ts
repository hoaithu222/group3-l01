import type { AxiosError } from 'axios';

import { extractErrorCode } from '@/core/api/error.handler';

/**
 * Mã lỗi nghĩa là "trạng thái đã đổi so với thứ đang hiện trên màn":
 *   JOB_001  job không còn trong hàng đợi (đã có người gỡ / hết hạn)
 *   JOB_002  job không còn ở trạng thái lỗi (đã chạy lại)
 *   JOB_003  bản ghi outbox không còn FAILED (đã được đưa lại)
 */
const STALE_JOB_ERRORS: ReadonlySet<string> = new Set(['JOB_001', 'JOB_002', 'JOB_003']);

export const isStaleJobError = (err: unknown): boolean =>
  STALE_JOB_ERRORS.has(extractErrorCode(err as AxiosError));

/**
 * Chạy 1 hành động và NUỐT lỗi "dữ liệu đã cũ" (`JOB_001..003`).
 *
 * Các lỗi này đã được interceptor toast bằng thông điệp tiếng Việt của BE và
 * hook đã làm mới danh sách; giữ modal mở là vô nghĩa vì thao tác không bao
 * giờ thành công được nữa. Lỗi khác vẫn ném tiếp ⇒ `ConfirmWithReasonModal`
 * giữ mở để người dùng thử lại.
 */
export async function tolerateStaleJob(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (!isStaleJobError(err)) throw err;
  }
}
