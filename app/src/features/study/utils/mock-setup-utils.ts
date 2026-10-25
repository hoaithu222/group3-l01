import type { CreateAttemptPayload } from '../api/mock-attempts.types';
import type { StudyItemDto } from '../api/study.types';

/** Mốc chọn nhanh số câu / thời lượng ở màn thiết lập (giữ đúng bộ mốc cũ: BE nhận 1–200 câu, 1–180 phút). */
export const MOCK_COUNTS = [10, 20, 40] as const;
export const MOCK_MINUTES = [10, 20, 30] as const;
/** BE `createAttemptSchema.tags.max(5)`. */
export const MOCK_TAGS_MAX = 5;

type ItemLike = Pick<StudyItemDto, 'tags' | 'type'>;

/** Đề chỉ lấy câu CHẤM ĐƯỢC — mọi loại trừ FLASHCARD (BE `GRADABLE_ITEM_TYPES`). */
export function gradableItems<T extends ItemLike>(items: readonly T[]): T[] {
  return items.filter((item) => item.type !== 'FLASHCARD');
}

export interface TopicCount {
  count: number;
  tag: string;
}

/** Chủ đề (thẻ của từng câu) kèm số câu chấm được; nhiều câu trước, bằng nhau thì theo chữ cái. */
export function topicCounts(items: readonly ItemLike[]): TopicCount[] {
  const counts = new Map<string, number>();
  for (const item of gradableItems(items)) {
    for (const tag of new Set(item.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ count, tag }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'vi'));
}

/** Số câu có thể vào đề: câu chấm được, và (nếu chọn chủ đề) có ÍT NHẤT một thẻ trùng — đúng luật lọc của BE. */
export function poolSize(items: readonly ItemLike[], tags: readonly string[]): number {
  const gradable = gradableItems(items);
  if (tags.length === 0) return gradable.length;
  const wanted = new Set(tags);
  return gradable.filter((item) => item.tags.some((tag) => wanted.has(tag))).length;
}

/** Số câu THỰC SỰ vào đề: BE cắt về số câu có sẵn. `pool = null` (chưa biết) ⇒ tin số người dùng chọn. */
export function effectiveCount(count: number, pool: number | null): number {
  return pool === null ? count : Math.min(count, pool);
}

/** Thời gian trung bình cho một câu (giây); không có câu nào ⇒ `null`. */
export function paceSeconds(minutes: number, questions: number): number | null {
  return questions > 0 ? Math.round((minutes * 60) / questions) : null;
}

/**
 * Nội dung `POST /study-sets/:id/mock-attempts`. Chỉ gửi trường KHÁC mặc định của BE (`shuffle` mặc định `true`,
 * `tags` mặc định rỗng) — cấu hình mặc định giữ nguyên hình dạng `{ count, durationSec }` như trước.
 */
export function buildCreatePayload(config: {
  count: number;
  minutes: number;
  shuffle: boolean;
  tags: readonly string[];
}): CreateAttemptPayload {
  const payload: CreateAttemptPayload = {
    count: config.count,
    durationSec: config.minutes * 60,
  };
  if (!config.shuffle) payload.shuffle = false;
  if (config.tags.length > 0) payload.tags = [...config.tags];
  return payload;
}

/** "Trung bình mỗi câu": dưới 90 giây hiện theo giây, từ 90 giây hiện theo phút (dấu PHẨY thập phân kiểu Việt). */
export function paceLabel(seconds: number): { unit: string; value: string } {
  if (seconds < 90) return { unit: 'giây / câu', value: String(seconds) };
  const minutes = Math.round((seconds / 60) * 10) / 10;
  return { unit: 'phút / câu', value: String(minutes).replace('.', ',') };
}
