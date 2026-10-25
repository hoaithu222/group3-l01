import * as Y from 'yjs';

import {
  addElement,
  applyChange,
  emptyChange,
  mergeChange,
  observeElements,
  orderedFromCache,
  readElements,
  removeElements,
  reorderElements,
  updateElements,
  type ElementsChange,
  type WhiteboardElement,
} from '../engine';
import { ctxOf, make, sync } from './support';

const alice = ctxOf('alice');

function record(doc: Y.Doc): { changes: ElementsChange[]; stop: () => void } {
  const changes: ElementsChange[] = [];
  const stop = observeElements(doc, (c) => changes.push(c));
  return { changes, stop };
}

describe('observeElements', () => {
  it('báo id được thêm, sửa một trường, xoá; và báo order khi thứ tự z đổi', () => {
    const doc = new Y.Doc();
    const { changes, stop } = record(doc);
    addElement(doc, make('rect', 'a'), alice);
    addElement(doc, make('rect', 'b'), alice);
    changes.length = 0;

    updateElements(doc, new Map([['a', { fillColor: 'red' }]]), alice);
    expect(changes).toHaveLength(1);
    expect([...(changes[0]?.changedIds ?? [])]).toEqual(['a']);
    expect(changes[0]?.orderChanged).toBe(false);

    changes.length = 0;
    reorderElements(doc, ['a'], 'front', alice);
    expect(changes.some((c) => c.orderChanged)).toBe(true);

    changes.length = 0;
    removeElements(doc, ['b'], alice);
    expect(changes.flatMap((c) => [...c.changedIds])).toContain('b');
    stop();
  });

  it('phân biệt thay đổi cục bộ và từ mạng', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const { changes } = record(a);
    addElement(a, make('rect', 'mine'), alice);
    addElement(b, make('rect', 'theirs'), ctxOf('bob'));
    sync(a, b);
    const byId = (id: string): ElementsChange | undefined =>
      changes.find((c) => c.changedIds.has(id));
    expect(byId('mine')?.local).toBe(true);
    expect(byId('theirs')?.local).toBe(false);
  });

  it('huỷ đăng ký thì im lặng', () => {
    const doc = new Y.Doc();
    const { changes, stop } = record(doc);
    stop();
    addElement(doc, make('rect', 'a'), alice);
    expect(changes).toHaveLength(0);
  });

  it('mergeChange gộp nhiều thay đổi thành một', () => {
    const merged = mergeChange(
      { changedIds: new Set(['a']), orderChanged: false, local: true },
      { changedIds: new Set(['b']), orderChanged: true, local: false },
    );
    expect([...merged.changedIds]).toEqual(['a', 'b']);
    expect(merged.orderChanged).toBe(true);
    expect(merged.local).toBe(false);
    expect(emptyChange().changedIds.size).toBe(0);
  });
});

describe('applyChange — bộ nhớ đệm giữ tham chiếu phần tử không đổi', () => {
  it('chỉ đọc lại id đổi; phần tử khác giữ NGUYÊN tham chiếu', () => {
    const doc = new Y.Doc();
    addElement(doc, make('rect', 'a'), alice);
    addElement(doc, make('rect', 'b'), alice);
    const cache = new Map<string, WhiteboardElement>(readElements(doc).map((e) => [e.id, e]));

    let pending = emptyChange();
    observeElements(doc, (c) => {
      pending = mergeChange(pending, c);
    });
    updateElements(doc, new Map([['a', { x: 99 }]]), alice);
    const next = applyChange(doc, cache, pending);

    expect(next.get('a')).not.toBe(cache.get('a'));
    expect(next.get('a')?.x).toBe(99);
    expect(next.get('b')).toBe(cache.get('b'));
  });

  it('phần tử bị xoá rời khỏi đệm; orderedFromCache theo thứ tự z', () => {
    const doc = new Y.Doc();
    addElement(doc, make('rect', 'a'), alice);
    addElement(doc, make('rect', 'b'), alice);
    const cache = new Map(readElements(doc).map((e) => [e.id, e]));
    removeElements(doc, ['a'], alice);
    const next = applyChange(doc, cache, {
      changedIds: new Set(['a']),
      orderChanged: true,
      local: true,
    });
    expect(next.has('a')).toBe(false);
    expect(orderedFromCache(doc, next).map((e) => e.id)).toEqual(['b']);
  });
});
