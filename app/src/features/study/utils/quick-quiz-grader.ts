import { normalizeSearch } from '@/shared/utils/format/string.utils';

import type { FillMatchMode, StudyItemDto } from '../api/study.types';

/**
 * Chấm MỘT câu của "Quiz nhanh" NGAY TRÊN MÁY — hàm THUẦN, mô phỏng đúng `be/src/modules/study/services/answer-grader.ts` (cùng hàm mà
 * thi thử và thi đấu trực tiếp dùng) để một câu không bao giờ "đúng ở Quiz nhanh, sai ở Thi thử". Chỉ là LUYỆN TẬP: kết quả không gửi đi đâu.
 *
 * ⚠️ Giữ khớp BE từng chữ. Đổi luật ở BE thì đổi Ở ĐÂY theo (test `quick-quiz-grader*.test.ts` mang lại các ca của `answer-grader.test.ts`).
 * Chuẩn hoá bỏ dấu dùng `normalizeSearch` của repo — cùng thuật toán với `normalizeSearch` của BE (NFD → bỏ dải U+0300–U+036F → `đ`→`d` → hạ chữ →
 * gộp trắng); `NFC` trước `NFD` của BE không đổi kết quả vì `NFD(NFC(x)) = NFD(x)`.
 */
export interface QuickAnswer {
  /** Trắc nghiệm / Đúng-Sai: đúng MỘT id; nhiều đáp án: tập id đã chọn. */
  optionIds?: readonly string[];
  /** Điền chỗ trống: chuỗi người học nhập. */
  text?: string;
}

export interface QuickGrade {
  correct: boolean;
  /**
   * Chỉ câu nhiều đáp án, 0..1: `(đúng ∩ chọn)/|đúng| − (sai ∩ chọn)/|sai|`, sàn 0 — dùng để nói "đúng một phần". ⛔ Đúng/sai KHÔNG đọc nó:
   * BE bắt khớp CHÍNH XÁC tập đáp án, một phần vẫn là SAI.
   */
  partial?: number;
}

type Gradable = Pick<
  StudyItemDto,
  'acceptedAnswers' | 'correctOptionIds' | 'matchMode' | 'options' | 'type'
>;

/** NFC + gộp khoảng trắng; `IGNORE_CASE` thêm hạ chữ; `IGNORE_ACCENTS` bỏ dấu tiếng Việt (kể cả `đ`). Trùng `normalizeAnswer` của BE. */
export function normalizeFillText(text: string, mode: FillMatchMode): string {
  if (mode === 'IGNORE_ACCENTS') return normalizeSearch(text);
  const base = text.normalize('NFC').replace(/\s+/g, ' ').trim();
  return mode === 'IGNORE_CASE' ? base.toLowerCase() : base;
}

function gradeMultiSelect(item: Gradable, chosen: ReadonlySet<string>): QuickGrade {
  const correct = new Set(item.correctOptionIds);
  const wrong = item.options.map((option) => option.id).filter((id) => !correct.has(id));
  const hit = [...chosen].filter((id) => correct.has(id)).length;
  const miss = chosen.size - hit;
  const gain = correct.size === 0 ? 0 : hit / correct.size;
  const loss = wrong.length === 0 ? 0 : miss / wrong.length;
  return {
    correct: chosen.size === correct.size && hit === correct.size,
    partial: Math.max(0, gain - loss),
  };
}

export function gradeQuickAnswer(item: Gradable, answer: QuickAnswer): QuickGrade {
  switch (item.type) {
    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE': {
      const ids = answer.optionIds ?? [];
      return { correct: ids.length === 1 && ids[0] === item.correctOptionIds[0] };
    }
    case 'MULTI_SELECT': {
      const chosen = new Set(answer.optionIds ?? []);
      return chosen.size === 0 ? { correct: false, partial: 0 } : gradeMultiSelect(item, chosen);
    }
    case 'FILL_BLANK': {
      if (answer.text === undefined) return { correct: false };
      const given = normalizeFillText(answer.text, item.matchMode);
      if (given.length === 0) return { correct: false };
      return {
        correct: item.acceptedAnswers.some((a) => normalizeFillText(a, item.matchMode) === given),
      };
    }
    case 'FLASHCARD':
      // Thẻ ghi nhớ tự đánh giá, không có đúng/sai — Quiz nhanh đã lọc chúng ra trước (`quizItems`).
      return { correct: false };
  }
}
