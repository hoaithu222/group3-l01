import { truncate } from '@/shared/utils/format';

import { STUDY_ITEM_PROMPT_MAX_CHARS } from '../constants/study-set-moderation.constants';
import type { AdminStudyItem } from '../types/study-set-moderation.types';

const clip = (text: string): string => truncate(text, STUDY_ITEM_PROMPT_MAX_CHARS);

/**
 * Đáp án hiển thị của một mục (cắt 200 ký tự):
 *  - FLASHCARD → mặt sau (`answerText`);
 *  - FILL_BLANK → các đáp án chấp nhận;
 *  - còn lại (trắc nghiệm/chọn nhiều/đúng-sai) → chữ của các lựa chọn ĐÚNG (rơi về id nếu thiếu chữ).
 * Trả `null` khi mục chưa có đáp án để hiện.
 */
export function studyItemAnswer(item: AdminStudyItem): string | null {
  if (item.type === 'FLASHCARD') return item.answerText ? clip(item.answerText) : null;
  if (item.type === 'FILL_BLANK') {
    return item.acceptedAnswers.length > 0 ? clip(item.acceptedAnswers.join(' · ')) : null;
  }
  const textById = new Map(item.options.map((o) => [o.id, o.text]));
  const correct = item.correctOptionIds.map((id) => textById.get(id) ?? id);
  return correct.length > 0 ? clip(correct.join(' · ')) : null;
}

/** Media đính kèm: CÓ ảnh/âm thanh hay không (ảnh xem được qua `studyItemImages`; âm thanh thì chỉ biết có). */
export function studyItemMedia(item: AdminStudyItem): { image: boolean; audio: boolean } {
  return {
    image:
      item.frontMediaAssetId !== null ||
      item.backMediaAssetId !== null ||
      item.options.some((o) => o.mediaAssetId !== null),
    audio: item.audioAssetId !== null,
  };
}

/** Một ảnh của mục: `url` là thumbnail ký ≤ 60 s (`null` = chưa có/chưa xử lý xong → hiện "Có ảnh"); `alt` mô tả vị trí ảnh. */
export interface StudyItemImage {
  key: string;
  url: string | null;
  alt: string;
}

/** Mọi ảnh của mục (mặt trước, mặt sau, ảnh từng lựa chọn) — chỉ những chỗ CÓ asset, theo thứ tự đọc. */
export function studyItemImages(item: AdminStudyItem): StudyItemImage[] {
  const n = item.order + 1;
  const images: StudyItemImage[] = [];
  if (item.frontMediaAssetId !== null) {
    images.push({
      key: 'front',
      url: item.frontMediaThumbUrl ?? null,
      alt: `Ảnh mặt trước của mục ${n}`,
    });
  }
  if (item.backMediaAssetId !== null) {
    images.push({
      key: 'back',
      url: item.backMediaThumbUrl ?? null,
      alt: `Ảnh mặt sau của mục ${n}`,
    });
  }
  item.options.forEach((option) => {
    if (option.mediaAssetId === null) return;
    images.push({
      key: `option-${option.id}`,
      url: option.mediaThumbUrl ?? null,
      alt: `Ảnh của lựa chọn "${clip(option.text)}" ở mục ${n}`,
    });
  });
  return images;
}

export const clipStudyText = clip;
