import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

import {
  applyChange,
  getBackground,
  mergeChange,
  observeElements,
  orderedFromCache,
  readElements,
  type BackgroundKind,
  type ElementsChange,
  type WhiteboardElement,
} from '../engine';

export interface ElementsState {
  background: BackgroundKind;
  /** id → phần tử; phần tử KHÔNG đổi giữ nguyên tham chiếu giữa các lần cập nhật (bộ vẽ so `===` để bỏ qua việc dựng lại). */
  byId: ReadonlyMap<string, WhiteboardElement>;
  /** Theo thứ tự z, dưới → trên. */
  elements: readonly WhiteboardElement[];
}

const read = (doc: Y.Doc): ElementsState => {
  const elements = readElements(doc);
  return {
    background: getBackground(doc),
    byId: new Map(elements.map((el) => [el.id, el])),
    elements,
  };
};

/**
 * Phần tử của bảng dưới dạng state React (app.md §4 `useElements`): nghe `observeElements` của engine, DỒN mọi thay đổi trong một khung hình
 * (`requestAnimationFrame` + `mergeChange`) rồi cập nhật bộ nhớ đệm bằng `applyChange` — chỉ đọc lại các id đổi, không đọc lại 5000 phần tử. Lúc
 * đồng bộ lần đầu server đổ cả bảng vào một transaction nên chỉ một lần cập nhật.
 * ⚠️ Nền (`meta.background`) đọc lại ở MỖI lần cập nhật (rẻ: một khoá) — không có observer riêng cho `meta`, đổi nền tới cùng nhịp với phần tử.
 * `doc` gắn với MỘT lần mở bảng (`useMemo` của runtime) nên không đổi trong đời hook — bảng khác = màn khác = hook mới.
 */
export function useWhiteboardElements(doc: Y.Doc): ElementsState {
  const [state, setState] = useState<ElementsState>(() => read(doc));

  useEffect(() => {
    let pending: ElementsChange | null = null;
    let frame: ReturnType<typeof requestAnimationFrame> | null = null;

    const flush = (): void => {
      frame = null;
      const change = pending;
      pending = null;
      if (!change) return;
      setState((prev) => {
        const cache = applyChange(doc, prev.byId, change);
        return {
          background: getBackground(doc),
          byId: cache,
          elements: orderedFromCache(doc, cache),
        };
      });
    };

    const stop = observeElements(doc, (change) => {
      pending = pending ? mergeChange(pending, change) : change;
      frame ??= requestAnimationFrame(flush);
    });
    return () => {
      stop();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [doc]);

  return state;
}
