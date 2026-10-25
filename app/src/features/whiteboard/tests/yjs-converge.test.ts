import * as Y from 'yjs';

import {
  addElement,
  readElementById,
  readElements,
  removeElements,
  updateElements,
} from '../engine';
import { ctxOf, make, sync } from './support';

const alice = ctxOf('alice');

describe('WB-01 — hai Y.Doc hội tụ', () => {
  it('một người đổi màu, một người di chuyển CÙNG hình: cả hai thay đổi được giữ', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    addElement(a, make('rect', 'r'), alice);
    sync(a, b);
    updateElements(a, new Map([['r', { fillColor: 'red' }]]), alice);
    updateElements(b, new Map([['r', { x: 200 }]]), ctxOf('bob'));
    sync(a, b);
    for (const doc of [a, b])
      expect(readElementById(doc, 'r')).toMatchObject({ fillColor: 'red', x: 200 });
    expect(readElements(a)).toEqual(readElements(b));
  });

  it('hai người cùng thêm phần tử khác nhau: cùng tập phần tử và cùng thứ tự z', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    addElement(a, make('rect', 'fromA'), alice);
    addElement(b, make('rect', 'fromB'), ctxOf('bob'));
    sync(a, b);
    expect(
      readElements(a)
        .map((e) => e.id)
        .sort(),
    ).toEqual(['fromA', 'fromB']);
    expect(readElements(a).map((e) => e.id)).toEqual(readElements(b).map((e) => e.id));
  });

  it('một người xoá, một người sửa cùng hình: hội tụ về CÙNG kết quả', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    addElement(a, make('rect', 'r'), alice);
    sync(a, b);
    removeElements(a, ['r'], alice);
    updateElements(b, new Map([['r', { x: 5 }]]), ctxOf('bob'));
    sync(a, b);
    expect(readElements(a)).toEqual(readElements(b));
  });
});
