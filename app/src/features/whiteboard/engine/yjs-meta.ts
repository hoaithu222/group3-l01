import type * as Y from 'yjs';

import { getMetaMap } from './doc-schema';
import { BACKGROUNDS } from './element.constants';
import type { BackgroundKind, WriteContext } from './element.types';

/** Nền canvas (`meta.background`); dữ liệu thiếu/lạ rơi về lưới — bảng mới tạo chưa ghi gì vào `meta`. */
export function getBackground(doc: Y.Doc): BackgroundKind {
  const value = getMetaMap(doc).get('background');
  return (BACKGROUNDS as readonly unknown[]).includes(value) ? (value as BackgroundKind) : 'grid';
}

/**
 * Đổi nền. Không nằm trong phạm vi undo (history.ts chỉ theo dõi `elements` + `order`): đổi nền không phải
 * "thao tác vẽ" nên nút hoàn tác không được kéo nó theo.
 */
export function setBackground(doc: Y.Doc, background: BackgroundKind, ctx: WriteContext): boolean {
  if (!(BACKGROUNDS as readonly string[]).includes(background)) return false;
  doc.transact(() => getMetaMap(doc).set('background', background), ctx.userId);
  return true;
}
