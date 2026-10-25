import type { FailedJobAction, OutboxStatus } from '../types/jobs.types';
import { QUEUE_NAMES } from '../types/jobs.types';

export type JobsSubTab = 'queues' | 'failed' | 'outbox';

/** Khoá URL của sub-tab — `?tab=jobs&sub=failed`. */
export const SUB_TAB_PARAM = 'sub';
export const DEFAULT_SUB_TAB: JobsSubTab = 'queues';

export const SUB_TAB_OPTIONS: { key: JobsSubTab; label: string }[] = [
  { key: 'queues', label: 'Hàng đợi' },
  { key: 'failed', label: 'Job lỗi' },
  { key: 'outbox', label: 'Outbox' },
];

/** Giá trị "không lọc" của dropdown — KHÔNG bao giờ lên URL/API. */
export const FILTER_ALL = 'all';

export const QUEUE_FILTER_OPTIONS = [
  { value: FILTER_ALL, label: 'Mọi hàng đợi' },
  ...QUEUE_NAMES.map((q) => ({ value: q, label: q })),
];

/** Outbox mở ra là thấy ngay các bản ghi cần người xử lý (admin.md p0-04 §2.3). */
export const OUTBOX_DEFAULT_STATUS: OutboxStatus = 'FAILED';

export const OUTBOX_STATUSES: OutboxStatus[] = ['PENDING', 'DISPATCHING', 'DISPATCHED', 'FAILED'];

/** Thuộc `PAGE_SIZE_OPTIONS` của `Table` (12·24·48·96) và ≤ trần `limit` 100 của BE. */
export const FAILED_DEFAULT_PAGE_SIZE = 24;

/** Chữ của hộp thoại xác nhận "Chạy lại" / "Gỡ bỏ" một job lỗi (admin.md p0-04 §2.4). */
export const FAILED_JOB_ACTION_COPY: Record<
  FailedJobAction,
  { title: string; impact: string; confirm: string; tone: 'danger' | 'primary' }
> = {
  retry: {
    title: 'Chạy lại job',
    impact: 'Job sẽ chạy lại với dữ liệu gốc.',
    confirm: 'Chạy lại',
    tone: 'primary',
  },
  remove: {
    title: 'Gỡ job lỗi',
    impact: 'Job bị gỡ hẳn khỏi hàng đợi và không thể khôi phục.',
    confirm: 'Gỡ bỏ',
    // Không hoàn tác được ⇒ nút xác nhận đỏ (cùng nhãn "Gỡ bỏ" đã đỏ ở footer ngăn kéo).
    tone: 'danger',
  },
};
