import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import type { DraftStore } from '../canvas/draft-store';
import {
  commitText,
  deleteSelection,
  duplicateSelection,
  reorderSelection,
  styleSelection,
} from '../canvas/interaction/actions';
import { createInteraction } from '../canvas/interaction/create-interaction';
import type { Interaction, InteractionEnv } from '../canvas/interaction/interaction.types';
import type { MeasureFn } from '../canvas/paint/text-layout';
import type { WhiteboardRuntime } from '../collab/whiteboard-runtime';
import type { ZMode } from '../engine';
import {
  useWhiteboardUiStore,
  type TextEditTarget,
  type ToolStyle,
} from '../store/whiteboard-ui.store';
import type { WhiteboardCamera } from './useWhiteboardCamera';
import type { ElementsState } from './useWhiteboardElements';

export interface WhiteboardActions {
  /** Đổi kiểu cho phần tử đang chọn (không đụng kiểu "vẽ tiếp theo" — nơi gọi tự `setStyle`). */
  applyStyle: (patch: Partial<ToolStyle>) => void;
  canRedo: boolean;
  canUndo: boolean;
  commitText: (target: TextEditTarget, text: string) => void;
  duplicate: () => void;
  /** Dựng bộ xử lý cử chỉ (gọi LƯỜI, lúc có cử chỉ đầu tiên — không phải lúc render); `null` khi không có quyền vẽ. */
  makeInteraction: (() => Interaction) | null;
  redo: () => void;
  remove: () => void;
  reorder: (mode: ZMode) => void;
  undo: () => void;
}

export interface ActionsInput {
  camera: Pick<WhiteboardCamera, 'get'>;
  canEdit: boolean;
  draftStore: DraftStore;
  measure: (fontSize: number) => MeasureFn;
  runtime: WhiteboardRuntime;
  state: ElementsState;
}

const LIMIT_TEXT = 'Bảng đã đầy — không thêm được nữa. Hãy xoá bớt hoặc tạo bảng mới.';

/**
 * Nối canvas với engine: dựng `InteractionEnv` (đọc-lúc-gọi: phần tử mới nhất, camera, công cụ, kiểu, vùng chọn) rồi trả bộ xử lý cử chỉ + các thao tác
 * của thanh công cụ (undo/redo, xoá, nhân bản, đổi thứ tự z, xong tấm soạn chữ). `interaction` là `null` khi KHÔNG có quyền vẽ ⇒ người xem không có đường
 * nào ghi vào Y.Doc từ UI (server vẫn từ chối update của họ — CW-07). Undo/redo cá nhân qua `Y.UndoManager` (WB-03); hoàn tác vượt trần → "Bảng đã đầy".
 */
export function useWhiteboardActions(input: ActionsInput): WhiteboardActions {
  const { camera, canEdit, draftStore, measure, runtime, state } = input;
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  const env = useMemo<InteractionEnv>(() => {
    const ui = () => useWhiteboardUiStore.getState();
    return {
      camera: camera.get,
      doc: runtime.doc,
      elements: () => latest.current.elements,
      now: () => Date.now(),
      pointer: (world) => runtime.publisher?.pointer(world),
      reportLimit: () => {
        ui().setLimitReached(true);
        showToast('info', LIMIT_TEXT);
      },
      requestTextEdit: (target) => ui().setTextEdit(target),
      selection: () => ui().selection,
      setDraft: draftStore.set,
      setSelection: (ids) => ui().setSelection(ids),
      setTool: (tool) => ui().setTool(tool),
      style: () => ui().style,
      tool: () => ui().tool,
      write: () => runtime.writeContext(),
    };
  }, [camera.get, draftStore.set, runtime]);

  const { history } = runtime;
  const canUndo = useSyncExternalStore(history.subscribe, history.canUndo);
  const canRedo = useSyncExternalStore(history.subscribe, history.canRedo);
  const makeInteraction = useMemo(() => (canEdit ? () => createInteraction(env) : null), [canEdit, env]);

  return useMemo(() => {
    const step = (result: 'done' | 'empty' | 'limit') => {
      if (result === 'limit') env.reportLimit();
    };
    return {
      applyStyle: (patch) => styleSelection(env, patch, measure),
      canRedo,
      canUndo,
      commitText: (target, text) => commitText(env, target, text, measure),
      duplicate: () => duplicateSelection(env),
      makeInteraction,
      redo: () => step(history.redo()),
      remove: () => deleteSelection(env),
      reorder: (mode) => reorderSelection(env, mode),
      undo: () => step(history.undo()),
    };
  }, [canRedo, canUndo, env, history, makeInteraction, measure]);
}
