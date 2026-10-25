import type { StudyItemDto } from '../api/study.types';
import { makeChoiceItem, makeItem } from './fixtures';

/**
 * Bộ câu giả cho test Quiz nhanh — theo thứ tự `order`: (1) trắc nghiệm có lời giải, (2) đúng/sai, (3) điền chỗ trống bỏ dấu, (4) nhiều đáp án, và một thẻ ghi
 * nhớ (5) mà Quiz nhanh PHẢI bỏ qua. Đáp án đúng: Hà Nội · Sai · "Hà Nội" · Hai + Bốn.
 */
export function makeQuizItems(): StudyItemDto[] {
  return [
    makeChoiceItem({
      correctOptionIds: ['o_aaaaaa'],
      explanation: 'Hà Nội là thủ đô từ năm 1010.',
      id: 'q1',
      order: 1,
      prompt: 'Thủ đô của Việt Nam là gì?',
    }),
    makeChoiceItem({
      correctOptionIds: ['o_false'],
      id: 'q2',
      options: [
        { id: 'o_true', mediaAssetId: null, text: 'Đúng' },
        { id: 'o_false', mediaAssetId: null, text: 'Sai' },
      ],
      order: 2,
      prompt: 'Trái đất hình vuông.',
      type: 'TRUE_FALSE',
    }),
    makeItem({
      acceptedAnswers: ['Hà Nội'],
      id: 'q3',
      matchMode: 'IGNORE_ACCENTS',
      order: 3,
      prompt: 'Thăng Long nay là thành phố nào?',
      type: 'FILL_BLANK',
    }),
    makeChoiceItem({
      correctOptionIds: ['o_two', 'o_four'],
      id: 'q4',
      options: [
        { id: 'o_one', mediaAssetId: null, text: 'Một' },
        { id: 'o_two', mediaAssetId: null, text: 'Hai' },
        { id: 'o_three', mediaAssetId: null, text: 'Ba' },
        { id: 'o_four', mediaAssetId: null, text: 'Bốn' },
      ],
      order: 4,
      prompt: 'Chọn các số chẵn.',
      type: 'MULTI_SELECT',
    }),
    makeItem({ id: 'card', order: 5, prompt: 'Thẻ ghi nhớ' }),
  ];
}

/** `n` câu trắc nghiệm giống nhau (đúng = "Hà Nội") — để thử các mốc "10 câu · 20 câu · Tất cả". */
export function makeManyChoiceItems(n: number): StudyItemDto[] {
  return Array.from({ length: n }, (_, i) =>
    makeChoiceItem({
      correctOptionIds: ['o_aaaaaa'],
      id: `m${i}`,
      order: i,
      prompt: `Câu ${i + 1}`,
    }),
  );
}
