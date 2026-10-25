import type { StudyItemDto, StudyOption } from '../api/study.types';
import { shuffle } from './flashcard-session';

/** Số câu người học chọn: một mốc cố định hoặc "Tất cả". */
export type QuizCount = 'all' | 10 | 20;

export interface QuizConfig {
  count: QuizCount;
  /** Trộn thứ tự câu (mặc định BẬT) — nếu tắt thì lấy các câu ĐẦU bộ theo thứ tự soạn. */
  shuffle: boolean;
}

const COUNT_STEPS = [10, 20] as const;

/** TRUE_FALSE luôn có hai lựa chọn cố định `o_true`/`o_false` (BE `buildContent`); dự phòng khi danh sách lựa chọn về rỗng. */
const TRUE_FALSE_OPTIONS: readonly StudyOption[] = [
  { id: 'o_true', mediaAssetId: null, text: 'Đúng' },
  { id: 'o_false', mediaAssetId: null, text: 'Sai' },
];

/**
 * Mục CHẤM ĐƯỢC TỰ ĐỘNG và trả lời được: loại trừ `FLASHCARD` (tự đánh giá) và mục thiếu dữ liệu để làm (trắc nghiệm không lựa chọn/không đáp án đúng,
 * điền chỗ trống không có đáp án nào) — thiếu thì nút "Kiểm tra" khoá mãi và người học kẹt ở câu đó. Cùng tập với `hasQuiz` của BE trên dữ liệu hợp lệ.
 */
export function isQuizItem(item: StudyItemDto): boolean {
  switch (item.type) {
    case 'MULTIPLE_CHOICE':
    case 'MULTI_SELECT':
      return item.options.length > 0 && item.correctOptionIds.length > 0;
    case 'TRUE_FALSE':
      return item.correctOptionIds.length > 0;
    case 'FILL_BLANK':
      return item.acceptedAnswers.some((answer) => answer.trim().length > 0);
    case 'FLASHCARD':
      return false;
  }
}

/** Các mục chấm được, theo thứ tự soạn (`order`). */
export function quizItems(items: readonly StudyItemDto[]): StudyItemDto[] {
  return items.filter(isQuizItem).sort((a, b) => a.order - b.order);
}

export function quizOptions(item: StudyItemDto): readonly StudyOption[] {
  if (item.type === 'TRUE_FALSE' && item.options.length === 0) return TRUE_FALSE_OPTIONS;
  return item.options;
}

/** Các mốc chọn được: chỉ mốc NHỎ HƠN tổng (mốc ≥ tổng trùng "Tất cả"), luôn kết bằng "Tất cả". */
export function countChoices(total: number): QuizCount[] {
  return [...COUNT_STEPS.filter((step) => step < total), 'all'];
}

/** Mặc định: 10 câu nếu bộ dài hơn 10, không thì tất cả — bộ ngắn không bắt chọn gì. */
export function defaultConfig(total: number): QuizConfig {
  return { count: total > COUNT_STEPS[0] ? COUNT_STEPS[0] : 'all', shuffle: true };
}

/**
 * Chọn các câu cho một lượt. `random` tiêm vào để test tất định; ⚠️ nơi gọi phải gọi trong HANDLER (bấm "Bắt đầu"), không trong lúc render —
 * `Math.random` lúc render làm câu đổi chỗ ở mỗi lần vẽ lại (và React Compiler cấm).
 */
export function pickRun(
  ids: readonly string[],
  config: QuizConfig,
  random?: () => number,
): string[] {
  const pool = config.shuffle ? shuffle(ids, random) : [...ids];
  return config.count === 'all' ? pool : pool.slice(0, config.count);
}
