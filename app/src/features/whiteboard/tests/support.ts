import * as Y from 'yjs';

import {
  createElement,
  type CreateInit,
  type ElementType,
  type WhiteboardElement,
} from '../engine';

/** Ngữ cảnh ghi cố định thời gian để test xác định. */
export const ctxOf = (userId: string, extra: { elementsMax?: number; now?: number } = {}) => ({
  userId,
  now: 1000,
  ...extra,
});

/** Dựng phần tử test: hộp 100×50 tại gốc, không tô, trừ khi `over` đổi. */
export function make(
  type: ElementType,
  id: string,
  over: CreateInit = {},
  userId = 'seed',
): WhiteboardElement {
  return createElement(type, { id, x: 0, y: 0, w: 100, h: 50, ...over }, { userId, now: 1 });
}

/**
 * Đồng bộ hai Y.Doc theo cả hai chiều (mô phỏng provider). Origin `'remote'` để phân biệt với origin cục bộ
 * `userId` — đúng như provider Hocuspocus áp update của người khác vào doc.
 */
export function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
}
