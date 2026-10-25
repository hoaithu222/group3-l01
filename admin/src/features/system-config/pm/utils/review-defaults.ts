import type { SystemConfigItem } from '../../types/system-config.types';
import { readPath } from '../../utils/config-fields';
import { REVIEW_FALLBACK, REVIEW_REQUIRED_MAX, REVIEW_REQUIRED_MIN } from '../constants/pm.constants';
import type { ReviewDefaultsFormValues } from '../schemas/review-defaults.schema';

/** Đường dẫn các field trong `value` của khoá `pm.review`. */
const ENABLED_PATH = 'enabledForNewBoards';
const REQUIRED_PATH = 'requiredReviews';
const HOURS_PATH = 'reminderHours';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numberOr = (raw: unknown, fallback: number): number => (isNum(raw) ? raw : fallback);

/** Mảng số hợp lệ (không rỗng) từ giá trị lạ của server; hỏng → `null` để rơi về mặc định thay vì làm vỡ form. */
function readHours(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.every(isNum) ? [...(raw as number[])] : null;
}

/**
 * Giá trị form từ giá trị HIỆU LỰC của server (`enabledForNewBoards` / `requiredReviews` / `reminderHours`); thiếu/hỏng
 * → mặc định khai trong registry (`fields[].default`), cuối cùng mới tới `REVIEW_FALLBACK`.
 */
export function toReviewForm(item: SystemConfigItem): ReviewDefaultsFormValues {
  const registryDefault = (path: string): unknown => item.fields.find((f) => f.path === path)?.default;
  const enabled = readPath(item.effective, ENABLED_PATH);
  const enabledDefault = registryDefault(ENABLED_PATH);
  const hours =
    readHours(readPath(item.effective, HOURS_PATH)) ??
    readHours(registryDefault(HOURS_PATH)) ??
    [...REVIEW_FALLBACK.reminderHours];
  return {
    enabledForNewBoards:
      typeof enabled === 'boolean'
        ? enabled
        : typeof enabledDefault === 'boolean'
          ? enabledDefault
          : REVIEW_FALLBACK.enabledForNewBoards,
    requiredReviews: numberOr(
      readPath(item.effective, REQUIRED_PATH),
      numberOr(registryDefault(REQUIRED_PATH), REVIEW_FALLBACK.requiredReviews),
    ),
    reminders: hours.map((h) => ({ hours: h })),
  };
}

/** Trần số lượt duyệt hiện hành = `ceil` của field `requiredReviews` do BE trả; thiếu → 5. */
export function requiredMaxOf(item: SystemConfigItem): number {
  const ceil = item.fields.find((f) => f.path === REQUIRED_PATH)?.ceil;
  return isNum(ceil) ? Math.max(REVIEW_REQUIRED_MIN, Math.trunc(ceil)) : REVIEW_REQUIRED_MAX;
}

/** Phần `value` gửi PUT: đủ ba field (khoá lạ đã lưu do `useJsonConfigField` giữ nguyên). */
export function reviewPatch(values: ReviewDefaultsFormValues): Record<string, unknown> {
  return {
    [ENABLED_PATH]: values.enabledForNewBoards,
    [REQUIRED_PATH]: values.requiredReviews,
    [HOURS_PATH]: values.reminders.map((r) => r.hours),
  };
}

/** Giá trị form đang xem (`useWatch`, có thể thiếu/dở dang) — chỉ dùng để dựng dòng so sánh sau khi sửa. */
export interface WatchedReview {
  enabledForNewBoards?: boolean;
  requiredReviews?: number | null;
  reminders?: Array<{ hours?: number | null } | undefined>;
}

/** Đắp phần đang nhập lên bản server: ô thiếu/không phải số giữ giá trị server; mốc nhắc trống bị bỏ khỏi dòng so sánh. */
export function mergeReviewForm(
  base: ReviewDefaultsFormValues,
  watched: WatchedReview | undefined,
): ReviewDefaultsFormValues {
  const rows = (watched?.reminders ?? []).flatMap((r) => (isNum(r?.hours) ? [{ hours: r.hours }] : []));
  return {
    enabledForNewBoards:
      typeof watched?.enabledForNewBoards === 'boolean'
        ? watched.enabledForNewBoards
        : base.enabledForNewBoards,
    requiredReviews: numberOr(watched?.requiredReviews, base.requiredReviews),
    reminders: watched?.reminders ? rows : base.reminders,
  };
}

/** "Bật · 2 lượt duyệt · nhắc sau 24 / 72 giờ" — một dòng để so trước/sau trong hộp thoại lý do. */
export function summarizeReview(values: ReviewDefaultsFormValues): string {
  const hours = values.reminders.map((r) => r.hours).join(' / ');
  return [
    values.enabledForNewBoards ? 'Bảng mới bật chấm chéo' : 'Bảng mới tắt chấm chéo',
    `${values.requiredReviews} lượt duyệt`,
    hours ? `nhắc sau ${hours} giờ` : 'không nhắc',
  ].join(' · ');
}
