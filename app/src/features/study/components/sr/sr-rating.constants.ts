import type { SrRating } from '../../api/sr.types';
import type { ActionTileTone } from '../flashcard/action-tile.styles';

/**
 * Nhãn + tông màu của bốn mức đánh giá SM-2 — MỘT nguồn cho nút chấm (`SrFeedbackButtons`) và ô số liệu tổng kết
 * (`SrSessionSummary`), để "Quên" luôn cùng màu ở cả hai chỗ.
 *
 * Tông theo NGỮ NGHĨA quen thuộc (như Anki): Quên = đỏ (`error`) · Khó = hổ phách (`warning`) · Vừa = xanh lá (`success`) · Dễ = xanh
 * dương (`info`). ⚠️ Màu chỉ hỗ trợ — nghĩa nằm ở chữ nhãn ("Quên/Khó/Vừa/Dễ") nên người mù màu vẫn phân biệt được.
 * Thứ tự hiển thị lấy từ `SR_RATING_ORDER` (`utils/sm2-preview.ts`), không lặp lại ở đây.
 */
export const SR_RATING_META: Record<SrRating, { label: string; tone: ActionTileTone }> = {
  AGAIN: { label: 'Quên', tone: 'error' },
  EASY: { label: 'Dễ', tone: 'info' },
  GOOD: { label: 'Vừa', tone: 'success' },
  HARD: { label: 'Khó', tone: 'warning' },
};

/** Mức được tô ĐẶC khi nơi gọi không gợi ý mức nào — "Vừa" là câu trả lời thường gặp nhất (như bản cũ: nút chính). */
export const SR_DEFAULT_RATING: SrRating = 'GOOD';
