import type { StudyItemDto } from '../api/study.types';
import { MATCH_MODE_LABELS } from '../constants/study.constants';

/** Mặt SAU của một mục khi học bằng thẻ: mọi loại mục đều học lật được (app.md p4-01 §3 `FlashcardStudy`). */
export function backText(item: StudyItemDto): string {
  switch (item.type) {
    case 'FLASHCARD':
      return item.answerText ?? '';
    case 'TRUE_FALSE':
      return item.correctOptionIds.includes('o_true') ? 'Đúng' : 'Sai';
    case 'FILL_BLANK':
      return item.acceptedAnswers.join(' / ');
    default:
      return item.options
        .filter((option) => item.correctOptionIds.includes(option.id))
        .map((option) => option.text)
        .join('\n');
  }
}

/** Mặt TRƯỚC: câu hỏi kèm các lựa chọn (trắc nghiệm) để người học tự nhẩm đáp án trước khi lật. */
export function frontLines(item: StudyItemDto): string[] {
  if (item.type === 'MULTIPLE_CHOICE' || item.type === 'MULTI_SELECT') {
    return item.options.map(
      (option, index) => `${String.fromCharCode(65 + index)}. ${option.text}`,
    );
  }
  if (item.type === 'TRUE_FALSE') return ['Đúng hay sai?'];
  if (item.type === 'FILL_BLANK')
    return [`Điền đáp án (${MATCH_MODE_LABELS[item.matchMode].toLowerCase()})`];
  return [];
}

/** Một dòng tóm tắt mục cho danh sách của trình soạn — cắt gọn, đọc được bằng trình đọc màn hình. */
export function summarize(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export interface CardMedia {
  audioAssetId: string | null;
  backImage: string | null;
  frontImage: string | null;
  /** Ảnh của từng lựa chọn (trắc nghiệm) kèm chữ cái A/B/C… khớp với `frontLines`. */
  optionImages: { assetId: string; label: string }[];
}

/** Ảnh/âm thanh của một mục khi học bằng thẻ — mặt trước hiện ảnh trước + ảnh lựa chọn, mặt sau hiện ảnh sau. */
export function cardMedia(item: StudyItemDto): CardMedia {
  const choice = item.type === 'MULTIPLE_CHOICE' || item.type === 'MULTI_SELECT';
  return {
    audioAssetId: item.audioAssetId,
    backImage: item.backMediaAssetId,
    frontImage: item.frontMediaAssetId,
    optionImages: choice
      ? item.options.flatMap((option, index) =>
          option.mediaAssetId
            ? [{ assetId: option.mediaAssetId, label: String.fromCharCode(65 + index) }]
            : [],
        )
      : [],
  };
}
