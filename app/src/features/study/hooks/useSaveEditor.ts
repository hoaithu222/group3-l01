import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';

import { studyService } from '../api/study.service';
import type { PutItemsResult } from '../api/study.types';
import { useSaveItems } from '../queries/study-items.queries';
import { studyKeys } from '../queries/study.keys';
import { useSetEditorStore } from '../store/set-editor.store';
import { computeDiff } from '../utils/editor-diff';
import type { EditorDraft } from '../utils/editor-draft';
import { getBulkErrorDetails, getErrorCode, STUDY_ERROR } from '../utils/error-info';
import type { ItemProblem } from '../utils/item-validation';
import { firstErroredKey, mapBulkErrors } from '../utils/map-bulk-errors';

export interface SaveOutcome {
  /** Mục đầu tiên cần sửa (theo thứ tự hiển thị) khi lưu không thành — màn nhảy tới đó. */
  firstBadKey?: string;
  ok: boolean;
}

/**
 * Lưu hàng loạt của trình soạn (app.md p4-01 §4 "Lưu"): nháp → `editor-diff` → `PUT items { expectedVersion, … }`.
 *
 *  · Mục còn lỗi kiểm cục bộ ⇒ KHÔNG gọi mạng, trả mục lỗi đầu tiên.
 *  · `400 STUDY_001` ⇒ lỗi gắn theo `clientItemKey` (store), nhảy tới mục lỗi đầu tiên.
 *  · `409 RES_003` ⇒ `conflict` (hộp thoại "Bộ học đã được sửa ở nơi khác"), GIỮ nguyên nháp.
 *  · Thành công ⇒ tải lại mục từ server làm bản gốc mới (có `id` thật cho mục vừa tạo — không phải tự ghép `idMap`).
 */
export function useSaveEditor(
  setId: string,
  draft: EditorDraft | undefined,
  problems: Record<string, ItemProblem[]>,
) {
  const queryClient = useQueryClient();
  const mutation = useSaveItems(setId);
  const [conflict, setConflict] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  async function reload(version: number): Promise<void> {
    const fresh = await queryClient.fetchQuery({
      queryFn: () => studyService.items(setId),
      queryKey: studyKeys.items(setId),
      staleTime: 0,
    });
    useSetEditorStore.getState().load(setId, fresh.setVersion ?? version, fresh.items);
  }

  async function save(): Promise<SaveOutcome> {
    if (!draft) return { ok: false };
    const diff = computeDiff(draft);
    const bad = diff.upsert
      .map((input) => input.clientItemKey)
      .filter((key) => (problems[key]?.length ?? 0) > 0);
    if (bad.length > 0)
      return {
        firstBadKey: firstErroredKey(Object.fromEntries(bad.map((k) => [k, 1])), draft.order),
        ok: false,
      };

    setBanner(null);
    try {
      const result: PutItemsResult = await mutation.mutateAsync({
        ...diff,
        expectedVersion: draft.baseVersion,
      });
      await reload(result.version);
      return { ok: true };
    } catch (error) {
      const code = getErrorCode(error);
      if (code === STUDY_ERROR.BULK_INVALID) {
        const errors = mapBulkErrors(getBulkErrorDetails(error), diff.upsert);
        useSetEditorStore.getState().setErrors(setId, errors);
        return { firstBadKey: firstErroredKey(errors, draft.order), ok: false };
      }
      if (code === STUDY_ERROR.VERSION_CONFLICT) setConflict(true);
      else setBanner(toErrorMessage(error));
      return { ok: false };
    }
  }

  /** "Tải bản mới" — bỏ nháp, dùng bản của server. */
  async function discardAndReload(): Promise<void> {
    setConflict(false);
    const detail = await queryClient.fetchQuery({
      queryFn: () => studyService.get(setId),
      queryKey: studyKeys.detail(setId),
      staleTime: 0,
    });
    await reload(detail.version);
  }

  /** "Giữ nháp và lưu đè" — lấy version mới rồi gửi lại đúng thay đổi của mình. */
  async function keepAndRetry(): Promise<SaveOutcome> {
    setConflict(false);
    const detail = await queryClient.fetchQuery({
      queryFn: () => studyService.get(setId),
      queryKey: studyKeys.detail(setId),
      staleTime: 0,
    });
    useSetEditorStore
      .getState()
      .apply(setId, (current) => ({ ...current, baseVersion: detail.version }));
    const fresh = useSetEditorStore.getState().drafts[setId];
    if (!fresh) return { ok: false };
    const diff = computeDiff(fresh);
    try {
      const result = await mutation.mutateAsync({ ...diff, expectedVersion: detail.version });
      await reload(result.version);
      return { ok: true };
    } catch (error) {
      setBanner(toErrorMessage(error));
      return { ok: false };
    }
  }

  return {
    banner,
    conflict,
    discardAndReload,
    dismissConflict: () => setConflict(false),
    keepAndRetry,
    save,
    saving: mutation.isPending,
  };
}
