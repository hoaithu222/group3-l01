import type { StudyItemType } from '../api/study.types';
import { newDraftItem, newOption, type DraftItem, type EditorDraft } from './editor-draft';

/** Các phép biến đổi THUẦN trên nháp — store chỉ gọi lại chúng (test được không cần React). */

/** `afterKey`: `undefined` = cuối danh sách · `null` = đầu danh sách · chuỗi = ngay SAU mục có khoá đó. */
export function addItem(
  draft: EditorDraft,
  item: DraftItem,
  afterKey?: string | null,
): EditorDraft {
  const index =
    afterKey === undefined
      ? draft.order.length
      : afterKey === null
        ? 0
        : draft.order.indexOf(afterKey) + 1;
  const order = [...draft.order];
  order.splice(index, 0, item.clientItemKey);
  return { ...draft, items: { ...draft.items, [item.clientItemKey]: item }, order };
}

/** Thêm NHIỀU mục vào cuối danh sách trong MỘT lần (nhập CSV/TSV) — một lần chép `order`, không phải N lần như gọi `addItem`. */
export function addItems(draft: EditorDraft, added: readonly DraftItem[]): EditorDraft {
  if (added.length === 0) return draft;
  const items = { ...draft.items };
  added.forEach((item) => (items[item.clientItemKey] = item));
  return { ...draft, items, order: [...draft.order, ...added.map((item) => item.clientItemKey)] };
}

export function updateItem(
  draft: EditorDraft,
  key: string,
  patch: Partial<DraftItem>,
): EditorDraft {
  const current = draft.items[key];
  if (!current) return draft;
  return { ...draft, items: { ...draft.items, [key]: { ...current, ...patch } } };
}

export function removeItem(draft: EditorDraft, key: string): EditorDraft {
  if (!(key in draft.items)) return draft;
  const items = { ...draft.items };
  delete items[key];
  return { ...draft, items, order: draft.order.filter((k) => k !== key) };
}

/** Dời một mục lên/xuống một bậc — mọi thao tác sắp xếp đều làm được bằng nút (không chỉ kéo thả). */
export function moveItem(draft: EditorDraft, key: string, direction: 'down' | 'up'): EditorDraft {
  const index = draft.order.indexOf(key);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= draft.order.length) return draft;
  const order = [...draft.order];
  [order[index], order[target]] = [order[target] as string, order[index] as string];
  return { ...draft, order };
}

/**
 * Đổi LOẠI mục, giữ phần chung (câu hỏi/giải thích/media/thẻ) và cấp lại phần riêng của loại mới. Đổi giữa hai loại
 * nhiều lựa chọn giữ nguyên danh sách lựa chọn; sang TRUE_FALSE/FILL_BLANK/FLASHCARD thì bỏ phần cũ.
 */
export function changeItemType(item: DraftItem, type: StudyItemType): DraftItem {
  if (item.type === type) return item;
  const fresh = newDraftItem(type);
  const choice = type === 'MULTIPLE_CHOICE' || type === 'MULTI_SELECT';
  const keepOptions = choice && item.options.length >= 2;
  const options = keepOptions ? item.options : fresh.options;
  const correctKeys = keepOptions
    ? type === 'MULTIPLE_CHOICE'
      ? item.correctKeys.slice(0, 1)
      : item.correctKeys
    : [];
  return {
    ...fresh,
    audioAssetId: item.audioAssetId,
    backMediaAssetId: item.backMediaAssetId,
    clientItemKey: item.clientItemKey,
    correctKeys,
    explanation: item.explanation,
    frontMediaAssetId: item.frontMediaAssetId,
    id: item.id,
    options,
    prompt: item.prompt,
    tags: item.tags,
  };
}

/** Bật/tắt một lựa chọn là đáp án đúng. `single` (MULTIPLE_CHOICE): chọn cái này thì bỏ cái cũ. */
export function toggleCorrect(item: DraftItem, optionKey: string): DraftItem {
  const single = item.type === 'MULTIPLE_CHOICE';
  const has = item.correctKeys.includes(optionKey);
  if (single) return { ...item, correctKeys: has ? [] : [optionKey] };
  return {
    ...item,
    correctKeys: has
      ? item.correctKeys.filter((k) => k !== optionKey)
      : [...item.correctKeys, optionKey],
  };
}

export function addOption(item: DraftItem, max: number): DraftItem {
  return item.options.length >= max ? item : { ...item, options: [...item.options, newOption()] };
}

export function removeOption(item: DraftItem, optionKey: string, min: number): DraftItem {
  if (item.options.length <= min) return item;
  return {
    ...item,
    correctKeys: item.correctKeys.filter((k) => k !== optionKey),
    options: item.options.filter((option) => option.key !== optionKey),
  };
}

export function setOptionText(item: DraftItem, optionKey: string, text: string): DraftItem {
  return {
    ...item,
    options: item.options.map((option) =>
      option.key === optionKey ? { ...option, text } : option,
    ),
  };
}
