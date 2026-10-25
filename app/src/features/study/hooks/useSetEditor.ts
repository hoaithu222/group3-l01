import { useEffect, useMemo, useRef } from 'react';

import { useCapabilities } from '@/shell/capabilities';

import type { StudyItemType } from '../api/study.types';
import { useStudyItems } from '../queries/study-items.queries';
import { useStudySet } from '../queries/study-sets.queries';
import { readStudyLimits } from '../schemas/study.schemas';
import { useSetEditorStore } from '../store/set-editor.store';
import { countChanges, isDraftDirty } from '../utils/editor-diff';
import { newDraftItem, type DraftItem } from '../utils/editor-draft';
import { addItem, addItems, moveItem, removeItem, updateItem } from '../utils/editor-ops';
import { validateDraftItem, type ItemProblem } from '../utils/item-validation';
import type { ItemErrors } from '../utils/map-bulk-errors';
import { useSaveEditor } from './useSaveEditor';

const NO_ERRORS: Record<string, ItemErrors> = {};

/**
 * Trình soạn mục (app.md p4-01 §4): nạp bộ + mục → nháp trong `set-editor.store`, các thao tác sửa nháp, kiểm cục bộ
 * theo `LIMITS.study` (từ `capabilities`, có trần dự phòng), và lưu hàng loạt (`useSaveEditor`).
 *
 * Nháp chỉ nạp MỘT lần cho mỗi phiên soạn: refetch nền của React Query KHÔNG được ghi đè thứ người dùng đang gõ
 * (`load` chỉ chạy khi chưa có nháp; nạp lại là hành động tường minh — "Tải bản mới").
 */
export function useSetEditor(setId: string) {
  const { data: capabilities } = useCapabilities();
  const limits = useMemo(() => readStudyLimits(capabilities?.limits), [capabilities?.limits]);
  const set = useStudySet(setId);
  const items = useStudyItems(setId);
  const draft = useSetEditorStore((state) => state.drafts[setId]);
  const serverErrors = useSetEditorStore((state) => state.errors[setId]) ?? NO_ERRORS;
  const apply = useSetEditorStore((state) => state.apply);
  const clearItemError = useSetEditorStore((state) => state.clearItemError);

  // Nạp nháp ĐÚNG MỘT LẦN mỗi lần mở màn: `drop` (bỏ thay đổi/rời màn) không được kéo nháp cũ về lại, và refetch nền
  // không được ghi đè thứ đang gõ. Nháp còn thay đổi chưa lưu từ lần trước (rời bằng nút cứng) thì GIỮ — 409 bảo vệ.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !set.data || !items.data) return;
    initialized.current = true;
    const existing = useSetEditorStore.getState().drafts[setId];
    if (existing && isDraftDirty(existing)) return;
    useSetEditorStore
      .getState()
      .load(setId, items.data.setVersion ?? set.data.version, items.data.items);
  }, [items.data, set.data, setId]);

  // Rời màn: nháp SẠCH thì bỏ (lần mở sau nạp bản mới của server); nháp còn thay đổi thì giữ trong bộ nhớ.
  useEffect(
    () => () => {
      const current = useSetEditorStore.getState().drafts[setId];
      if (current && !isDraftDirty(current)) useSetEditorStore.getState().drop(setId);
    },
    [setId],
  );

  const problems = useMemo(() => {
    const result: Record<string, ItemProblem[]> = {};
    if (!draft) return result;
    for (const key of draft.order) {
      const item = draft.items[key];
      const found = item ? validateDraftItem(item, limits) : [];
      if (found.length > 0) result[key] = found;
    }
    return result;
  }, [draft, limits]);

  // `computeDiff` là O(số mục) và chạy mỗi lần vẽ — chỉ tính lại khi nháp đổi (mỗi phím gõ đã là một lần đổi).
  const changeCount = useMemo(() => (draft ? countChanges(draft) : 0), [draft]);
  const saver = useSaveEditor(setId, draft, problems);

  /** Thêm mục MỚI ngay sau `afterKey` (mặc định cuối danh sách); trả khoá để màn mở form của nó. */
  function add(type: StudyItemType, afterKey?: string | null): string {
    const item = newDraftItem(type);
    apply(setId, (current) => addItem(current, item, afterKey));
    return item.clientItemKey;
  }

  /** Nhập thẻ ghi nhớ từ CSV/TSV: thêm MỘT LẦN vào cuối danh sách (nháp, chưa lưu). Trả số thẻ đã thêm. */
  function importFlashcards(cards: readonly { definition: string; term: string }[]): number {
    const added = cards.map(({ definition, term }) => ({
      ...newDraftItem('FLASHCARD'),
      answerText: definition,
      prompt: term,
    }));
    apply(setId, (current) => addItems(current, added));
    return added.length;
  }

  function patch(
    key: string,
    patchValue: Partial<DraftItem> | ((item: DraftItem) => DraftItem),
  ): void {
    apply(setId, (current) => {
      const item = current.items[key];
      if (!item) return current;
      const next = typeof patchValue === 'function' ? patchValue(item) : { ...item, ...patchValue };
      return updateItem(current, key, next);
    });
    clearItemError(setId, key);
  }

  return {
    ...saver,
    add,
    changeCount,
    draft,
    importFlashcards,
    isLoading: set.isLoading || items.isLoading || (Boolean(set.data && items.data) && !draft),
    itemCount: draft?.order.length ?? 0,
    limits,
    loadError: set.error ?? items.error,
    /** Tải lại bộ học + danh sách mục — nút "Thử lại" khi nạp lỗi. */
    reload: () => {
      void set.refetch();
      void items.refetch();
    },
    move: (key: string, direction: 'down' | 'up') =>
      apply(setId, (current) => moveItem(current, key, direction)),
    patch,
    problems,
    remove: (key: string) => apply(setId, (current) => removeItem(current, key)),
    serverErrors,
    set: set.data,
  };
}
