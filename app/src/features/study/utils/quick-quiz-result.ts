import type { ProgressRingTone } from '@/shared/ui/progress-ring';

import type { StudyItemDto } from '../api/study.types';
import { backText, summarize } from './item-summary';

export type AnswerCardState = 'correct' | 'idle' | 'missed' | 'muted' | 'selected' | 'wrong';

/**
 * Trạng thái của MỘT thẻ đáp án. Trước khi chấm chỉ có "đang chọn"/"chưa chọn"; sau khi chấm: chọn đúng (`correct`), chọn sai (`wrong`), đáp án đúng mà
 * người học BỎ SÓT (`missed` — quan trọng ở câu nhiều đáp án), và phần còn lại mờ đi (`muted`).
 */
export function cardState(
  optionId: string,
  picked: readonly string[],
  correctIds: readonly string[],
  checked: boolean,
): AnswerCardState {
  const isPicked = picked.includes(optionId);
  if (!checked) return isPicked ? 'selected' : 'idle';
  const isCorrect = correctIds.includes(optionId);
  if (isPicked) return isCorrect ? 'correct' : 'wrong';
  return isCorrect ? 'missed' : 'muted';
}

export interface ResultLevel {
  message: string;
  tone: ProgressRingTone;
}

/** Nhận xét ngắn theo điểm % — ngưỡng trùng cách người học tự đọc điểm: trọn vẹn · tốt · tạm ổn · cần luyện thêm. */
export function resultLevel(percent: number): ResultLevel {
  if (percent >= 100) return { message: 'Xuất sắc! Bạn trả lời đúng tất cả.', tone: 'success' };
  if (percent >= 80) return { message: 'Rất tốt! Chỉ còn vài câu cần ôn lại.', tone: 'success' };
  if (percent >= 50)
    return { message: 'Khá ổn. Luyện lại các câu sai để nhớ chắc hơn.', tone: 'brand' };
  return { message: 'Chưa vững. Hãy luyện lại các câu sai nhé.', tone: 'brand' };
}

export interface WrongRow {
  answer: string;
  id: string;
  prompt: string;
}

/** Tối đa bấy nhiêu câu sai hiện ở tổng kết — phần còn lại nói bằng "và N câu khác" (danh sách dài không đẩy nút hành động ra khỏi màn). */
export const WRONG_PREVIEW_MAX = 5;

/** Dòng "câu sai" rút gọn: đề + đáp án đúng, cắt gọn để mỗi dòng đọc lướt được. Bỏ qua khoá không còn trong bộ (bộ vừa sửa). */
export function wrongRows(
  wrongIds: readonly string[],
  byId: ReadonlyMap<string, StudyItemDto>,
): WrongRow[] {
  return wrongIds.flatMap((id) => {
    const item = byId.get(id);
    if (!item) return [];
    return [
      {
        answer: summarize(backText(item).replace(/\n/g, ' / '), 80),
        id,
        prompt: summarize(item.prompt, 100),
      },
    ];
  });
}
