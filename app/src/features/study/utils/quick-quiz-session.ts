import type { StudyItemDto } from '../api/study.types';
import { gradeQuickAnswer, type QuickGrade } from './quick-quiz-grader';

/**
 * Trạng thái MỘT lượt Quiz nhanh — toàn hàm THUẦN để test không cần React (cùng khuôn `flashcard-session.ts`). Chạy hoàn toàn TRÊN MÁY:
 * không có gì ở đây (hay ở hook bọc nó) gọi API hay ghi điểm/XP lên server.
 */
export interface QuizResult {
  correct: boolean;
  itemId: string;
}

export interface QuizRun {
  /** Chuỗi đúng dài nhất của lượt — hiện ở màn tổng kết. */
  bestStreak: number;
  /** Kết quả chấm của câu HIỆN TẠI; `null` = chưa bấm "Kiểm tra". Có giá trị ⇒ câu đã KHOÁ (không đổi đáp án nữa). */
  checked: QuickGrade | null;
  index: number;
  /** Khoá mục theo thứ tự làm (đã chọn số câu + trộn). */
  order: readonly string[];
  /** Lựa chọn nháp của câu hiện tại (trắc nghiệm / đúng-sai / nhiều đáp án). */
  picked: readonly string[];
  /** Kết quả các câu ĐÃ chấm, theo thứ tự làm. */
  results: readonly QuizResult[];
  /** Số câu đúng liên tiếp tính tới câu vừa chấm; sai thì về 0. */
  streak: number;
  /** Chữ nháp của câu điền chỗ trống. */
  text: string;
}

export interface QuizTally {
  bestStreak: number;
  correct: number;
  percent: number;
  total: number;
  /** Khoá các câu SAI theo thứ tự làm — nguồn của "Luyện lại câu sai" và danh sách ở tổng kết. */
  wrongIds: string[];
}

export function startRun(ids: readonly string[]): QuizRun {
  return {
    bestStreak: 0,
    checked: null,
    index: 0,
    order: ids,
    picked: [],
    results: [],
    streak: 0,
    text: '',
  };
}

export const isFinished = (run: QuizRun): boolean => run.index >= run.order.length;

export const currentId = (run: QuizRun): string | undefined => run.order[run.index];

/** Một đáp án: chọn là THAY; nhiều đáp án: bấm để bật/tắt. Câu đã chấm thì không đổi được. */
export function pick(run: QuizRun, optionId: string, multi: boolean): QuizRun {
  if (run.checked) return run;
  if (!multi) return { ...run, picked: [optionId] };
  const picked = run.picked.includes(optionId)
    ? run.picked.filter((id) => id !== optionId)
    : [...run.picked, optionId];
  return { ...run, picked };
}

export function typeText(run: QuizRun, text: string): QuizRun {
  return run.checked ? run : { ...run, text };
}

/** Có gì để "Kiểm tra" chưa: đã chọn ít nhất một lựa chọn, hoặc đã gõ chữ (khoảng trắng suông không tính). */
export function canCheck(run: QuizRun, item: StudyItemDto): boolean {
  if (run.checked) return false;
  return item.type === 'FILL_BLANK' ? run.text.trim().length > 0 : run.picked.length > 0;
}

/** Chấm câu hiện tại, cập nhật chuỗi đúng. Chấm rồi (hoặc chưa có đáp án) thì giữ nguyên — bấm đúp không cộng hai lần. */
export function check(run: QuizRun, item: StudyItemDto): QuizRun {
  if (!canCheck(run, item)) return run;
  const grade = gradeQuickAnswer(item, { optionIds: run.picked, text: run.text });
  const streak = grade.correct ? run.streak + 1 : 0;
  return {
    ...run,
    bestStreak: Math.max(run.bestStreak, streak),
    checked: grade,
    results: [...run.results, { correct: grade.correct, itemId: item.id }],
    streak,
  };
}

/** Sang câu kế (chỉ khi câu hiện tại đã chấm); câu cuối rồi thì `index === order.length` = màn tổng kết. */
export function advance(run: QuizRun): QuizRun {
  if (!run.checked) return run;
  return { ...run, checked: null, index: run.index + 1, picked: [], text: '' };
}

export function tally(run: QuizRun): QuizTally {
  const total = run.results.length;
  const correct = run.results.filter((result) => result.correct).length;
  return {
    bestStreak: run.bestStreak,
    correct,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    total,
    wrongIds: run.results.filter((result) => !result.correct).map((result) => result.itemId),
  };
}
