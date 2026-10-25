import * as Y from 'yjs';

import {
  addElements,
  cleanOrder,
  duplicateElements,
  getOrderArray,
  readElementById,
  readElements,
  readOrder,
  reorderElements,
  zOrderMoves,
  type ZMode,
  type ZMove,
} from '../engine';
import { ctxOf, make, sync } from './support';

const alice = ctxOf('alice');

/** Áp danh sách bước lên một mảng, đúng cách adapter áp lên Y.Array. */
function simulate(order: string[], moves: ZMove[]): string[] {
  const work = [...order];
  for (const { from, to } of moves) {
    const [id] = work.splice(from, 1);
    if (id !== undefined) work.splice(to, 0, id);
  }
  return work;
}

describe('zOrderMoves (thuần)', () => {
  const order = ['a', 'b', 'c', 'd'];
  const run = (ids: string[], mode: ZMode): string[] =>
    simulate(order, zOrderMoves(order, new Set(ids), mode));

  it.each<[string, string[], ZMode, string[]]>([
    ['đưa một hình lên trên cùng', ['a'], 'front', ['b', 'c', 'd', 'a']],
    ['đưa nhóm lên trên cùng, giữ thứ tự tương đối', ['a', 'c'], 'front', ['b', 'd', 'a', 'c']],
    ['đưa nhóm xuống dưới cùng', ['b', 'd'], 'back', ['b', 'd', 'a', 'c']],
    ['tiến một bậc', ['a'], 'forward', ['b', 'a', 'c', 'd']],
    ['tiến một bậc cho nhóm liền kề', ['a', 'b'], 'forward', ['c', 'a', 'b', 'd']],
    ['lùi một bậc', ['d'], 'backward', ['a', 'b', 'd', 'c']],
  ])('%s', (_name, ids, mode, expected) => {
    expect(run(ids, mode)).toEqual(expected);
  });

  it.each<[string[], ZMode]>([
    [['c', 'd'], 'front'],
    [['a'], 'back'],
    [['d'], 'forward'],
    [['a'], 'backward'],
    [['x'], 'front'],
  ])('đã ở đúng chỗ (%p, %s) thì không sinh bước nào', (ids, mode) => {
    expect(zOrderMoves(order, new Set(ids), mode)).toEqual([]);
  });
});

describe('cleanOrder', () => {
  it('giữ lần xuất hiện CUỐI, bỏ id đã xoá, xếp id mồ côi cuối theo id', () => {
    expect(cleanOrder(['a', 'b', 'a', 'x'], new Set(['a', 'b', 'c']))).toEqual(['b', 'a', 'c']);
  });
});

describe('reorderElements trên Y.Doc', () => {
  const seed = (doc: Y.Doc): void => {
    addElements(
      doc,
      ['a', 'b', 'c'].map((id) => make('rect', id)),
      alice,
    );
  };

  it('đưa lên trên cùng đổi thứ tự z, gọi lại khi đã ở trên thì false', () => {
    const doc = new Y.Doc();
    seed(doc);
    expect(reorderElements(doc, ['a'], 'front', alice)).toBe(true);
    expect(readElements(doc).map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(reorderElements(doc, ['a'], 'front', alice)).toBe(false);
  });

  it('hai máy CÙNG đưa một hình lên trên: id lặp trong mảng thô nhưng đọc ra vẫn đúng, và lần đổi sau tự dọn', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    seed(a);
    sync(a, b);
    reorderElements(a, ['a'], 'front', alice);
    reorderElements(b, ['a'], 'front', ctxOf('bob'));
    sync(a, b);
    expect(
      getOrderArray(a)
        .toArray()
        .filter((id) => id === 'a').length,
    ).toBeGreaterThan(1);
    expect(readOrder(a)).toEqual(['b', 'c', 'a']);
    expect(readOrder(b)).toEqual(['b', 'c', 'a']);
    reorderElements(a, ['b'], 'front', alice);
    expect(getOrderArray(a).toArray()).toEqual(['c', 'a', 'b']);
  });
});

describe('duplicateElements', () => {
  it('nhân bản dời offset, lên trên cùng; dính sang bản sao nếu đích cũng được nhân bản, gỡ nếu không', () => {
    const doc = new Y.Doc();
    addElements(
      doc,
      [
        make('rect', 'r', { x: 10, y: 10 }),
        make('rect', 's'),
        make('arrow', 'a', { startBinding: { elementId: 'r' }, endBinding: { elementId: 's' } }),
      ],
      alice,
    );
    const res = duplicateElements(doc, ['a', 'r'], { x: 20, y: 30 }, alice);
    expect(res.ok).toBe(true);
    const ids = res.ok ? res.ids : [];
    expect(ids).toHaveLength(2);
    expect(
      readElements(doc)
        .map((e) => e.id)
        .slice(-2),
    ).toEqual(ids);
    const [copyR, copyA] = ids.map((id) => readElementById(doc, id));
    expect(copyR).toMatchObject({ type: 'rect', x: 30, y: 40 });
    expect(copyA?.startBinding).toEqual({ elementId: copyR?.id });
    expect(copyA?.endBinding).toBeUndefined();
    expect(readElementById(doc, 'a')?.startBinding).toEqual({ elementId: 'r' });
  });

  it('chịu cùng trần: hết chỗ thì từ chối và không thêm gì', () => {
    const doc = new Y.Doc();
    const ctx = ctxOf('alice', { elementsMax: 2 });
    addElements(doc, [make('rect', 'a'), make('rect', 'b')], ctx);
    expect(duplicateElements(doc, ['a'], { x: 1, y: 1 }, ctx)).toEqual({
      ok: false,
      reason: 'limit',
      max: 2,
    });
    expect(readElements(doc)).toHaveLength(2);
  });
});
