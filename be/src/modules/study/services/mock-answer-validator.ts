import type { AnswerDto } from "../dtos";
import type { MockAnswerInput, MockQuestion } from "../entities/mock.interface";
import { mockErrors } from "../study.errors";

export interface ValidatedAnswers {
  /** Đáp án ghi (đã khử trùng theo `itemId`, bản CUỐI thắng). */
  upserts: MockAnswerInput[];
  /** `itemId` người học bỏ chọn / xoá chữ → xoá đáp án đã lưu. */
  clears: string[];
}

const SINGLE_CHOICE = new Set(["MULTIPLE_CHOICE", "TRUE_FALSE"]);

/**
 * Kiểm đáp án gửi lên có THUỘC ĐỀ (snapshot) — `MOCK_005` khi `itemId` lạ, lựa chọn không thuộc câu, sai dạng
 * (điền chỗ trống thiếu `text`, trắc nghiệm thiếu `optionIds`, một-đáp-án chọn nhiều). HÀM THUẦN.
 */
export function validateAnswers(questions: readonly MockQuestion[], answers: readonly AnswerDto[]): ValidatedAnswers {
  const byItem = new Map(questions.map((q) => [q.itemId, q]));
  const last = new Map<string, AnswerDto>();
  for (const a of answers) last.set(a.itemId, a);

  const upserts: MockAnswerInput[] = [];
  const clears: string[] = [];
  for (const [itemId, a] of last) {
    const q = byItem.get(itemId);
    if (!q) throw mockErrors.notInExam({ itemId });

    if (q.type === "FILL_BLANK") {
      if (a.text === undefined) throw mockErrors.notInExam({ itemId, reason: "TEXT_REQUIRED" });
      const text = a.text.trim();
      if (text.length === 0) clears.push(itemId);
      else upserts.push({ itemId, optionIds: [], text, timeMs: a.timeMs });
      continue;
    }

    if (a.optionIds === undefined) throw mockErrors.notInExam({ itemId, reason: "OPTIONS_REQUIRED" });
    const optionIds = [...new Set(a.optionIds)];
    const known = new Set(q.options.map((o) => o.id));
    if (optionIds.some((id) => !known.has(id)) || (SINGLE_CHOICE.has(q.type) && optionIds.length > 1)) {
      throw mockErrors.notInExam({ itemId, reason: "OPTION_INVALID" });
    }
    if (optionIds.length === 0) clears.push(itemId);
    else upserts.push({ itemId, optionIds, text: null, timeMs: a.timeMs });
  }
  return { upserts, clears };
}
