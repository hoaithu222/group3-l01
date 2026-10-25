import type { SrRating } from '../../api/sr.types';
import { SR_RATING_ORDER } from '../../utils/sm2-preview';

/** Phần trăm nguyên 0..100 — thiếu số hoặc tổng ≤ 0 thì 0 (không ra `NaN%` trên thanh tiến độ). */
export function percentOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

/** "3/20" — vị trí thẻ đang xem (đếm từ 1, kẹp trong tổng). Cùng khuôn với `progressText` của phiên học thẻ. */
export function cardCounter(index: number, total: number): string {
  return `${Math.min(index + 1, total)}/${total}`;
}

/** Thanh tiến độ = số thẻ ĐÃ QUA / tổng (thẻ đang xem chưa tính — khớp bản cũ, nên thẻ đầu là 0%). */
export function passedPercent(index: number, total: number): number {
  return percentOf(Math.min(index, total), total);
}

export type CardStatus = 'known' | 'unknown';

/** Chữ của huy hiệu trên mặt thẻ VÀ của nhãn trợ năng — một nguồn để hai chỗ không lệch nhau. */
export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  known: 'Đã chọn: thuộc',
  unknown: 'Đã chọn: chưa thuộc',
};

/** Thẻ đã được chấm gì trong phiên (xem lại bằng "Trước") — `null` nếu chưa chấm. */
export function cardStatus(
  id: string | undefined,
  known: readonly string[],
  unknown: readonly string[],
): CardStatus | null {
  if (id === undefined) return null;
  if (known.includes(id)) return 'known';
  return unknown.includes(id) ? 'unknown' : null;
}

export type RatingStats = Record<SrRating, number>;

export interface RatingSummary {
  /** Số thẻ không chọn "Quên" — theo SM-2, q ≥ 3 là còn nhớ (lịch vẫn dãn ra). */
  remembered: number;
  /** % nhớ được trên số thẻ đã ôn (0 khi chưa ôn thẻ nào). */
  recallPercent: number;
  total: number;
}

/** Tổng hợp một phiên ôn: bao nhiêu thẻ, bao nhiêu thẻ còn nhớ. `AGAIN` (q=1) là thẻ duy nhất bị coi là quên. */
export function summarizeRatings(stats: RatingStats): RatingSummary {
  const total = SR_RATING_ORDER.reduce((sum, rating) => sum + stats[rating], 0);
  const remembered = total - stats.AGAIN;
  return { recallPercent: percentOf(remembered, total), remembered, total };
}

/** Lời nhắn cuối phiên học thẻ theo % đã thuộc — đúng ba nấc, không tô hồng khi người học chưa thuộc bao nhiêu. */
export function masteryMessage(percent: number, known: number, total: number): string {
  if (total > 0 && known >= total) return `Bạn đã thuộc hết ${total} thẻ.`;
  if (percent >= 80) return 'Gần như thuộc cả bộ — ôn nốt vài thẻ còn lại nhé.';
  if (percent >= 50) return 'Đã nắm được một nửa. Học lại thẻ chưa thuộc để chắc hơn.';
  return 'Mới bắt đầu thôi. Học lại thẻ chưa thuộc để nhớ lâu hơn.';
}
