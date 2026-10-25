import { normalizeSearch } from "../../../core/utils/normalize";
import type { FillMatchModeValue, StudyItemTypeValue } from "../entities/study-item.interface";

/**
 * Chấm MỘT câu — hàm THUẦN (không I/O), dùng chung p4-01 (kiểm), p4-02 (mock test) và p5-01 (live quiz):
 * cả ba gọi ĐÚNG hàm này nên "đúng/sai" nhất quán ở mọi nơi. Đầu vào là dạng tối thiểu (`GradableItem`) — cả
 * `StudyItem` lẫn snapshot `MockQuestion` của p4-02 đều thoả, không cần chuyển đổi.
 */
export interface GradableItem {
  type: StudyItemTypeValue;
  /** Lựa chọn (MC/MULTI_SELECT/TRUE_FALSE) — chỉ cần `id`. */
  options?: ReadonlyArray<{ id: string }>;
  correctOptionIds: readonly string[];
  acceptedAnswers: readonly string[];
  matchMode: FillMatchModeValue;
}

export interface AnswerInput {
  /** MC/TRUE_FALSE: đúng 1 id; MULTI_SELECT: tập id đã chọn. */
  optionIds?: readonly string[];
  /** FILL_BLANK: chuỗi người học nhập. */
  text?: string;
}

export interface GradeResult {
  correct: boolean;
  /** Chỉ MULTI_SELECT: 0..1 (đúng ∩ chọn)/|đúng| − (sai ∩ chọn)/|sai|, sàn 0 — dùng cho `byTag`. */
  partial?: number;
}

/** Chuẩn hoá chuỗi so khớp theo chế độ: NFC + gộp khoảng trắng; IGNORE_CASE thêm hạ chữ; IGNORE_ACCENTS bỏ dấu (`normalizeSearch`). */
export function normalizeAnswer(text: string, mode: FillMatchModeValue): string {
  if (mode === "IGNORE_ACCENTS") return normalizeSearch(text);
  const base = text.normalize("NFC").replace(/\s+/g, " ").trim();
  return mode === "IGNORE_CASE" ? base.toLowerCase() : base;
}

function gradeMultiSelect(item: GradableItem, chosen: ReadonlySet<string>): GradeResult {
  const correct = new Set(item.correctOptionIds);
  const wrong = (item.options ?? []).map((o) => o.id).filter((id) => !correct.has(id));
  const hit = [...chosen].filter((id) => correct.has(id)).length;
  const miss = [...chosen].filter((id) => !correct.has(id)).length;
  const isCorrect = chosen.size === correct.size && hit === correct.size;
  const gain = correct.size === 0 ? 0 : hit / correct.size;
  const loss = wrong.length === 0 ? 0 : miss / wrong.length;
  return { correct: isCorrect, partial: Math.max(0, gain - loss) };
}

export function gradeAnswer(item: GradableItem, answer: AnswerInput): GradeResult {
  switch (item.type) {
    case "MULTIPLE_CHOICE":
    case "TRUE_FALSE": {
      const ids = answer.optionIds ?? [];
      return { correct: ids.length === 1 && ids[0] === item.correctOptionIds[0] };
    }
    case "MULTI_SELECT": {
      const chosen = new Set(answer.optionIds ?? []);
      return chosen.size === 0 ? { correct: false, partial: 0 } : gradeMultiSelect(item, chosen);
    }
    case "FILL_BLANK": {
      const text = answer.text;
      if (text === undefined) return { correct: false };
      const given = normalizeAnswer(text, item.matchMode);
      if (given.length === 0) return { correct: false };
      return { correct: item.acceptedAnswers.some((a) => normalizeAnswer(a, item.matchMode) === given) };
    }
    case "FLASHCARD":
      // Thẻ ghi nhớ không chấm đúng/sai — người học tự đánh giá (SR p4-02). Caller lọc loại chấm được trước.
      return { correct: false };
  }
}
