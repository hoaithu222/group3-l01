import { nanoid } from "../../../core/utils/nanoid";
import type { StudyItemInput } from "../dtos";
import {
  FALSE_OPTION_ID,
  TRUE_OPTION_ID,
  type StudyItemContent,
  type StudyOption,
} from "../entities/study-item.interface";
import { normalizeAnswer } from "./answer-grader";
import { normalizeTags } from "./study-tags";

/** `"o_" + nanoid(6)` — id lựa chọn ổn định (xáo trộn khi thi không làm lệch đáp án). */
export function newOptionId(): string {
  return `o_${nanoid(6)}`;
}

interface OptionInput {
  id?: string;
  text: string;
  mediaAssetId?: string | null;
}

/** Gán id còn thiếu, tránh trùng id đã có trong cùng mục. */
function withOptionIds(options: readonly OptionInput[]): StudyOption[] {
  const used = new Set(options.flatMap((o) => (o.id ? [o.id] : [])));
  return options.map((o) => {
    let id = o.id;
    while (!id || (!o.id && used.has(id))) id = newOptionId();
    used.add(id);
    return { id, text: o.text, mediaAssetId: o.mediaAssetId ?? null };
  });
}

/** Mọi lựa chọn/đáp án dùng cho loại khác của mục cũ bị xoá trắng — PUT ghi ĐÈ toàn bộ nội dung. */
const EMPTY = {
  answerText: null,
  options: [] as StudyOption[],
  correctOptionIds: [] as string[],
  acceptedAnswers: [] as string[],
  matchMode: "IGNORE_CASE" as const,
};

/**
 * DTO đã qua `studyItemSchema` + kiểm ngữ nghĩa → nội dung mục lưu DB. Client gửi INDEX đáp án; ở đây đổi thành
 * `correctOptionIds` sau khi gán id lựa chọn. TRUE_FALSE dùng 2 lựa chọn cố định `o_true`/`o_false`.
 */
export function buildContent(input: StudyItemInput): StudyItemContent {
  const common = {
    prompt: input.prompt,
    explanation: input.explanation && input.explanation.trim().length > 0 ? input.explanation : null,
    frontMediaAssetId: input.frontMediaAssetId ?? null,
    backMediaAssetId: input.backMediaAssetId ?? null,
    audioAssetId: input.audioAssetId ?? null,
    tags: normalizeTags(input.tags),
  };

  switch (input.type) {
    case "FLASHCARD":
      return { ...EMPTY, ...common, type: "FLASHCARD", answerText: input.answerText };
    case "MULTIPLE_CHOICE": {
      const options = withOptionIds(input.options);
      return { ...EMPTY, ...common, type: "MULTIPLE_CHOICE", options, correctOptionIds: [options[input.correctOptionIndex].id] };
    }
    case "MULTI_SELECT": {
      const options = withOptionIds(input.options);
      const ids = input.correctOptionIndexes.map((i) => options[i].id);
      return { ...EMPTY, ...common, type: "MULTI_SELECT", options, correctOptionIds: ids };
    }
    case "TRUE_FALSE":
      return {
        ...EMPTY,
        ...common,
        type: "TRUE_FALSE",
        options: [
          { id: TRUE_OPTION_ID, text: "Đúng", mediaAssetId: null },
          { id: FALSE_OPTION_ID, text: "Sai", mediaAssetId: null },
        ],
        correctOptionIds: [input.correct ? TRUE_OPTION_ID : FALSE_OPTION_ID],
      };
    case "FILL_BLANK": {
      // Khử trùng theo dạng chuẩn hoá của chế độ so khớp — hai đáp án chỉ khác hoa/dấu (khi bỏ qua) là một.
      const seen = new Set<string>();
      const acceptedAnswers = input.acceptedAnswers.filter((a) => {
        const key = normalizeAnswer(a, input.matchMode);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { ...EMPTY, ...common, type: "FILL_BLANK", acceptedAnswers, matchMode: input.matchMode };
    }
  }
}
