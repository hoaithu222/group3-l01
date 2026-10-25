import type { ItemInput } from '../api/study.types';
import type { DraftItem, EditorDraft } from './editor-draft';

/** Một mục nháp → thân `upsert[]` của `PUT /study-sets/:id/items` (BE ghi ĐÈ toàn bộ nội dung mục). */
export function toItemInput(item: DraftItem, afterClientItemKey?: string | null): ItemInput {
  const common = {
    audioAssetId: item.audioAssetId,
    backMediaAssetId: item.backMediaAssetId,
    clientItemKey: item.clientItemKey,
    explanation: item.explanation.trim() || null,
    frontMediaAssetId: item.frontMediaAssetId,
    prompt: item.prompt.trim(),
    tags: item.tags,
    ...(item.id ? { id: item.id } : {}),
    ...(afterClientItemKey !== undefined ? { afterClientItemKey } : {}),
  };
  switch (item.type) {
    case 'FLASHCARD':
      return { ...common, answerText: item.answerText.trim(), type: 'FLASHCARD' };
    case 'TRUE_FALSE':
      return { ...common, correct: item.correct, type: 'TRUE_FALSE' };
    case 'FILL_BLANK':
      return {
        ...common,
        acceptedAnswers: item.acceptedAnswers.map((answer) => answer.trim()).filter(Boolean),
        matchMode: item.matchMode,
        type: 'FILL_BLANK',
      };
    default: {
      const options = item.options.map((option) => ({
        ...(option.id ? { id: option.id } : {}),
        mediaAssetId: option.mediaAssetId,
        text: option.text.trim(),
      }));
      const indexes = item.options.flatMap((option, index) =>
        item.correctKeys.includes(option.key) ? [index] : [],
      );
      return item.type === 'MULTIPLE_CHOICE'
        ? { ...common, correctOptionIndex: indexes[0] ?? 0, options, type: 'MULTIPLE_CHOICE' }
        : { ...common, correctOptionIndexes: indexes, options, type: 'MULTI_SELECT' };
    }
  }
}

/** Chữ ký NỘI DUNG (không tính `afterClientItemKey`) — hai mục cùng chữ ký là không đổi nội dung. */
export function contentSignature(item: DraftItem): string {
  const input = { ...toItemInput(item) } as Record<string, unknown>;
  delete input.afterClientItemKey;
  delete input.clientItemKey;
  delete input.id;
  return JSON.stringify(input);
}

function predecessors(keys: readonly string[]): Map<string, string | null> {
  return new Map(keys.map((key, index) => [key, index === 0 ? null : (keys[index - 1] as string)]));
}

export interface EditorDiff {
  delete: string[];
  upsert: ItemInput[];
}

/**
 * Nháp so với bản gốc → `{ upsert, delete }` (app.md p4-01 §2 `editor-diff`). Chỉ gửi mục MỚI, mục ĐỔI nội dung và
 * mục ĐỔI CHỖ so với các mục đã có còn lại (so hàng xóm TRƯỚC trong dãy chỉ gồm mục đã có, nên chèn mục mới ở giữa
 * không làm mục kế tiếp bị tính là "đã dời"). `afterClientItemKey` của mục nào cũng lấy theo thứ tự ĐẦY ĐỦ của nháp —
 * BE đặt lần lượt theo thứ tự trong `upsert[]`, mục sau có thể neo vào mục mới đứng ngay trước nó.
 */
export function computeDiff(draft: EditorDraft): EditorDiff {
  const remove = draft.baseOrder
    .filter((key) => !(key in draft.items))
    .map((key) => draft.base[key]?.id as string);

  const survivingBase = draft.baseOrder.filter((key) => key in draft.items);
  const existingNow = draft.order.filter((key) => key in draft.base);
  const basePrev = predecessors(survivingBase);
  const nowPrev = predecessors(existingNow);

  const upsert: ItemInput[] = [];
  draft.order.forEach((key, index) => {
    const item = draft.items[key] as DraftItem;
    const base = draft.base[key];
    const after = index === 0 ? null : (draft.order[index - 1] as string);
    const contentChanged = !base || contentSignature(base) !== contentSignature(item);
    const moved = Boolean(base) && basePrev.get(key) !== nowPrev.get(key);
    if (contentChanged || moved) upsert.push(toItemInput(item, after));
  });
  return { delete: remove, upsert };
}

export function isDraftDirty(draft: EditorDraft): boolean {
  const diff = computeDiff(draft);
  return diff.upsert.length > 0 || diff.delete.length > 0;
}

/** Số thay đổi chưa lưu — hiện ở `UnsavedBar` ("3 thay đổi chưa lưu"). */
export function countChanges(draft: EditorDraft): number {
  const diff = computeDiff(draft);
  return diff.upsert.length + diff.delete.length;
}
