import { toErrorMessage } from '@/core/api/client.helpers';

import { CRITICAL_PATH_ERROR_MESSAGES } from '../constants/critical-path.constants';
import type { ReschedulePreviewDto } from '../api/critical-path.types';
import { getErrorCode, getErrorDetails } from './error-details';

/** Thẻ không tra được tiêu đề (ngoài cache) — vẫn nói được "một thẻ khác" thay vì để trống cả vòng. */
const UNKNOWN_TASK = 'một thẻ khác';

/**
 * Mã lỗi p4-04 → câu tiếng Việt cho màn (app.md §3). `TASK_005` là ca đặc biệt: BE chỉ trả id trong
 * `details.cycle = [S, …, P]` (đường sẵn có S ⇝ P; cạnh mới P → S khép vòng), còn người dùng cần đọc được THẺ NÀO
 * — nên dịch id thành tiêu đề qua `resolveTitle` và khép vòng ("B → C → A → B"). Mã khác/không phải lỗi có mã
 * (mất mạng…) rơi về `toErrorMessage`, giữ nguyên câu "lỗi kết nối" của base.
 */
export function criticalPathErrorMessage(
  error: unknown,
  resolveTitle?: (taskId: string) => string | undefined,
): string {
  const code = getErrorCode(error);
  if (code === 'TASK_005') {
    const cycle = getErrorDetails(error)?.cycle;
    if (Array.isArray(cycle) && cycle.length > 1) {
      const names = cycle.map((id) => resolveTitle?.(String(id)) ?? UNKNOWN_TASK);
      return `Tạo vòng phụ thuộc: ${[...names, names[0]].join(' → ')}. Hãy gỡ bớt một liên kết trong vòng trước.`;
    }
  }
  return (code ? CRITICAL_PATH_ERROR_MESSAGES[code] : undefined) ?? toErrorMessage(error);
}

/**
 * `details.preview` của `TASK_006` (PATCH lùi hạn) và `TASK_019` (kế hoạch cũ). `null` khi thiếu/hỏng — nơi gọi rơi
 * về lỗi thường, ⛔ không mở tấm cảnh báo rỗng (nút "Dời lịch" khi không có `previewToken` chắc chắn bị từ chối).
 */
export function readPreviewFromError(error: unknown): ReschedulePreviewDto | null {
  const preview = getErrorDetails(error)?.preview as Partial<ReschedulePreviewDto> | undefined;
  if (!preview || typeof preview.previewToken !== 'string' || !preview.source) return null;
  return {
    affected: preview.affected ?? [],
    affectedCount: preview.affectedCount ?? preview.affected?.length ?? 0,
    mode: preview.mode ?? 'SYNC',
    previewToken: preview.previewToken,
    skipped: preview.skipped ?? [],
    source: preview.source,
    timezone: preview.timezone ?? 'Asia/Ho_Chi_Minh',
    truncated: Boolean(preview.truncated),
  };
}
