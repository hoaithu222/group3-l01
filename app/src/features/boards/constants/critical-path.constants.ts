import type { BadgeVariant } from '@/shared/ui/badge';

import type { ColumnKind } from '../api/boards.types';
import type { RescheduleSkipReason } from '../api/critical-path.types';

/**
 * Hằng số của p4-04 (đường găng · dời lịch · Gantt).
 *
 * ── Nhãn lỗi nằm Ở ĐÂY, không ở `shared/constants/error-codes.ts` ─────────────
 * File chung đã chạm trần `max: 236` của `file-size-manifest.json`, và `TASK_005/006/017–021` chỉ có nghĩa trong
 * luồng phụ thuộc/dời lịch này — cùng cách nhãn `MOCK_*`, `SR_*` nằm trong feature của chúng. Mọi request p4-04
 * đều `skipErrorToast: true` nên interceptor không tự toast: màn tự tra bảng này (`criticalPathErrorMessage`).
 * Câu lấy đúng `ErrorMessages` của BE để hai nơi nói cùng một thứ tiếng; riêng `TASK_020` theo app.md §3.
 */
export const CRITICAL_PATH_ERROR_MESSAGES: Record<string, string> = {
  TASK_005: 'Không thể tạo phụ thuộc vòng giữa các thẻ',
  TASK_006: 'Đổi hạn này sẽ dời lịch các thẻ phía sau, vui lòng xác nhận',
  TASK_017: 'Phụ thuộc không hợp lệ: hai thẻ phải khác nhau, cùng bảng và chưa bị xoá',
  TASK_018: 'Thẻ đã đạt số phụ thuộc tối đa',
  TASK_019: 'Lịch các thẻ đã thay đổi, vui lòng xem lại trước khi dời',
  TASK_020: 'Bảng đang dời lịch, thử lại sau',
  TASK_021: 'Chuỗi phụ thuộc quá lớn để xử lý',
};

/** Nhịp hỏi lại trạng thái lô nền khi còn `QUEUED/RUNNING` (app.md §4). */
export const RESCHEDULE_BATCH_POLL_MS = 5000;

/** `staleTime` của phụ thuộc (app.md §4). */
export const DEPENDENCY_STALE_MS = 30_000;

/**
 * `save` của `useTaskDetailState` trả chuỗi này khi `PATCH` bị `TASK_006` và tấm cảnh báo dời lịch ĐÃ mở: tấm ngày
 * KHÔNG được đóng và KHÔNG hiện lỗi (người dùng chưa làm sai gì, chỉ cần xác nhận). Là một chuỗi để không đổi
 * chữ ký `Promise<string | null>` mà `TaskHeader`/`commit` đang dùng.
 */
export const RESCHEDULE_PENDING = 'reschedule-pending';

export const SKIP_REASON_TEXT: Record<RescheduleSkipReason, string> = {
  DELETED: 'Thẻ đã bị xoá',
  DONE: 'Thẻ đã hoàn thành',
  NO_DATES: 'Thẻ chưa có ngày',
};

/** Ba mức khoảng ngày của Gantt (app.md §3): 2 tuần / tháng / quý. */
export type GanttRangeKey = '2w' | 'month' | 'quarter';

export const GANTT_RANGES: readonly { key: GanttRangeKey; label: string }[] = [
  { key: '2w', label: '2 tuần' },
  { key: 'month', label: 'Tháng' },
  { key: 'quarter', label: 'Quý' },
];

export const DEFAULT_GANTT_RANGE: GanttRangeKey = 'month';

/**
 * Bề rộng MỘT ngày (dp) theo mức xem. Khoảng càng dài ngày càng hẹp để cả biểu đồ còn cuộn được trong vài
 * màn hình; 20dp/ngày vẫn đủ để thanh một-ngày (mốc) bấm được nhờ `hitSlop` của hàng.
 */
export const GANTT_DAY_WIDTH: Record<GanttRangeKey, number> = { '2w': 56, month: 36, quarter: 20 };

/**
 * Hàng 48dp = 18 (dòng tên thẻ) + 28 (thanh) + 2 (khe). Thanh chỉ cao 28dp nên vùng bấm được nới bằng `hitSlop` tới 44dp;
 * dòng tên nằm TRÊN thanh để mũi tên (đi theo tâm thanh) không cắt ngang chữ.
 */
export const GANTT_ROW_HEIGHT = 48;
export const GANTT_LABEL_HEIGHT = 18;
export const GANTT_BAR_HEIGHT = 28;
export const GANTT_AXIS_HEIGHT = 44;
/** Số hàng vẽ thêm ngoài vùng nhìn thấy để cuộn nhanh không nhấp nháy. */
export const GANTT_ROW_OVERSCAN = 4;
/** Đoạn ngang tối thiểu (dp) ra/vào thanh của mũi tên phụ thuộc. */
export const GANTT_ARROW_GAP = 10;

/** Tông huy hiệu theo loại cột của thẻ ở đầu kia phụ thuộc — chữ trên huy hiệu luôn là tên cột nên không dựa vào màu. */
export const COLUMN_KIND_BADGE: Record<ColumnKind, BadgeVariant> = {
  DONE: 'success',
  IN_PROGRESS: 'info',
  REVIEW: 'warning',
  TODO: 'neutral',
};
