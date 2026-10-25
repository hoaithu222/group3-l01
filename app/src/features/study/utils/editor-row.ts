import { contentSignature } from './editor-diff';
import type { DraftItem, EditorDraft } from './editor-draft';
import { summarize } from './item-summary';
import type { ItemProblem } from './item-validation';

/** `new` = chưa có trên server · `edited` = đã có nhưng NỘI DUNG khác bản gốc (đổi chỗ đơn thuần không tính). */
export type ItemChange = 'edited' | 'new';

/**
 * Mục nào đã đổi so với bản gốc — để hàng danh sách hiện huy hiệu "Mới"/"Đã sửa". Cùng chữ ký nội dung với `computeDiff`
 * (nên "Đã sửa" khớp đúng thứ sẽ được gửi lên), nhưng CHỈ tính nội dung: mục bị dời chỗ mà không sửa gì không phải "đã sửa".
 */
export function changedItems(draft: EditorDraft): Record<string, ItemChange> {
  const result: Record<string, ItemChange> = {};
  for (const key of draft.order) {
    const item = draft.items[key];
    if (!item) continue;
    const base = draft.base[key];
    if (!base) result[key] = 'new';
    else if (contentSignature(base) !== contentSignature(item)) result[key] = 'edited';
  }
  return result;
}

export type RowBadgeKind = 'edited' | 'missing-answer' | 'needs-fix' | 'new';

export interface RowBadge {
  kind: RowBadgeKind;
  label: string;
}

/** Trường lỗi thuộc về ĐÁP ÁN — chỉ lỗi ở đây (mà câu hỏi đã ổn) mới gọi là "Thiếu đáp án". */
const ANSWER_FIELDS: ReadonlySet<string> = new Set(['acceptedAnswers', 'answerText', 'correct']);

/**
 * Huy hiệu của một hàng, TỐI ĐA hai: (1) vấn đề — "Cần sửa" (server báo, hoặc còn lỗi ngoài đáp án) hay "Thiếu đáp án" (chỉ
 * thiếu đáp án) — rồi (2) thay đổi "Mới"/"Đã sửa". Nhãn là CHỮ (không chỉ màu): nơi vẽ thêm icon cho vấn đề.
 */
export function rowBadges(args: {
  change?: ItemChange;
  problems: readonly ItemProblem[];
  serverError: boolean;
}): RowBadge[] {
  const { change, problems, serverError } = args;
  const badges: RowBadge[] = [];
  if (serverError || problems.some((problem) => !ANSWER_FIELDS.has(problem.field))) {
    badges.push({ kind: 'needs-fix', label: 'Cần sửa' });
  } else if (problems.length > 0) {
    badges.push({ kind: 'missing-answer', label: 'Thiếu đáp án' });
  }
  if (change === 'new') badges.push({ kind: 'new', label: 'Mới' });
  else if (change === 'edited') badges.push({ kind: 'edited', label: 'Đã sửa' });
  return badges;
}

const DETAIL_MAX = 60;

/** Dòng phụ dưới câu hỏi: đáp án/số lựa chọn — để rà cả bộ mà không phải mở từng mục. */
export function itemDetail(item: DraftItem): string {
  switch (item.type) {
    case 'FLASHCARD': {
      const answer = summarize(item.answerText, DETAIL_MAX);
      return answer ? `→ ${answer}` : 'Chưa có định nghĩa';
    }
    case 'TRUE_FALSE':
      return `Đáp án: ${item.correct ? 'Đúng' : 'Sai'}`;
    case 'FILL_BLANK': {
      const answers = item.acceptedAnswers.map((answer) => answer.trim()).filter(Boolean);
      return answers.length > 0
        ? `Đáp án: ${summarize(answers.join(' / '), DETAIL_MAX)}`
        : 'Chưa có đáp án';
    }
    default: {
      const correct = item.correctKeys.length;
      return `${item.options.length} lựa chọn · ${correct > 0 ? `${correct} đúng` : 'chưa chọn đáp án đúng'}`;
    }
  }
}

/** Mục có ảnh/âm thanh không (kể cả ảnh của lựa chọn) — hàng danh sách vẽ icon nhỏ. */
export function itemMediaFlags(item: DraftItem): { audio: boolean; image: boolean } {
  return {
    audio: Boolean(item.audioAssetId),
    image:
      Boolean(item.frontMediaAssetId) ||
      Boolean(item.backMediaAssetId) ||
      item.options.some((option) => Boolean(option.mediaAssetId)),
  };
}

/**
 * Mục CHƯA có gì (không chữ, không đáp án, không media) — xoá thì không cần hỏi lại. Chỉ nhìn phần người dùng gõ/đính; dạng
 * mục và lựa chọn trống mặc định không phải "nội dung".
 */
export function isItemBlank(item: DraftItem): boolean {
  const flags = itemMediaFlags(item);
  return (
    !item.prompt.trim() &&
    !item.answerText.trim() &&
    !item.explanation.trim() &&
    item.acceptedAnswers.every((answer) => !answer.trim()) &&
    item.options.every((option) => !option.text.trim()) &&
    !flags.audio &&
    !flags.image
  );
}
