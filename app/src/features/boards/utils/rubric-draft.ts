import type { RubricCriterion, RubricCriterionInput } from '../api/reviews.types';
import { NEW_CRITERION_MAX_SCORE } from '../constants/review.constants';

/**
 * Bản NHÁP tiêu chí đang chỉnh trong `RubricBuilder` (cùng khuôn `columns-draft.ts`). Tách khỏi `RubricCriterionInput` vì ô nhập cần
 * chuỗi (`maxScore: ''` khi đang xoá gõ lại) và mỗi dòng cần `key` ổn định cho React — `id` của tiêu chí mới chưa có (BE cấp `r_xxxxxx`).
 */
export interface RubricDraft {
  description: string;
  /** Có ⇒ tiêu chí đã tồn tại (giữ `id` để đổi tên không thành "xoá + tạo mới" — điểm các lượt cũ theo `id`). */
  id?: string;
  key: string;
  label: string;
  maxScore: string;
}

export type RubricPatch = Partial<Pick<RubricDraft, 'description' | 'label' | 'maxScore'>>;

let counter = 0;
const nextKey = (): string => {
  counter += 1;
  return `criterion-draft-${counter}`;
};

export function toRubricDrafts(rubric: readonly RubricCriterion[]): RubricDraft[] {
  return rubric.map((criterion) => ({
    description: criterion.description ?? '',
    id: criterion.id,
    key: nextKey(),
    label: criterion.label,
    maxScore: String(criterion.maxScore),
  }));
}

/** Nháp → payload; `id` chỉ gửi cho tiêu chí đã có (be.md §3: thiếu `id` = tiêu chí mới), mô tả trống thì bỏ. */
export function toRubricInputs(drafts: readonly RubricDraft[]): RubricCriterionInput[] {
  return drafts.map((draft) => {
    const description = draft.description.trim();
    return {
      ...(draft.id ? { id: draft.id } : {}),
      ...(description ? { description } : {}),
      label: draft.label.trim(),
      maxScore: Number.parseInt(draft.maxScore, 10),
    };
  });
}

export function addCriterion(drafts: readonly RubricDraft[]): RubricDraft[] {
  return [...drafts, { description: '', key: nextKey(), label: '', maxScore: String(NEW_CRITERION_MAX_SCORE) }];
}

export function updateCriterion(drafts: readonly RubricDraft[], key: string, patch: RubricPatch): RubricDraft[] {
  return drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft));
}

export function removeCriterion(drafts: readonly RubricDraft[], key: string): RubricDraft[] {
  return drafts.filter((draft) => draft.key !== key);
}

/** Đổi chỗ với hàng xóm; đã ở đầu/cuối thì trả lại đúng mảng cũ. */
export function moveCriterion(drafts: readonly RubricDraft[], key: string, direction: -1 | 1): RubricDraft[] {
  const from = drafts.findIndex((draft) => draft.key === key);
  const a = drafts[from];
  const b = drafts[from + direction];
  if (!a || !b) return [...drafts];
  const next = [...drafts];
  next[from] = b;
  next[from + direction] = a;
  return next;
}

/** Tổng điểm tối đa của các tiêu chí có số hợp lệ — hiện ngay dưới danh sách ("Tổng 10 điểm"). */
export function rubricDraftTotal(drafts: readonly RubricDraft[]): number {
  return drafts.reduce((sum, draft) => {
    const score = Number.parseInt(draft.maxScore, 10);
    return sum + (Number.isFinite(score) && score > 0 ? score : 0);
  }, 0);
}
