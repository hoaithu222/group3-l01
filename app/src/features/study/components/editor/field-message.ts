import type { ItemProblem } from '../../utils/item-validation';

/** Lỗi đầu tiên của một trường (`prompt`, `options.2.text`…) — `undefined` khi trường hợp lệ. */
export function fieldMessage(problems: readonly ItemProblem[], field: string): string | undefined {
  return problems.find((problem) => problem.field === field)?.message;
}
