import * as Y from 'yjs';

import {
  addElement,
  addElements,
  countElements,
  readElementById,
  readElements,
  remainingCapacity,
  WB_LIMITS,
} from '../engine';
import { ctxOf, make } from './support';

const alice = ctxOf('alice');

describe('addElement / readElements', () => {
  it('ghi vào elements + order, đọc ra theo thứ tự z, đóng dấu người ghi', () => {
    const doc = new Y.Doc();
    addElement(doc, make('rect', 'r1'), alice);
    addElements(doc, [make('ellipse', 'r2'), make('text', 'r3')], alice);
    expect(readElements(doc).map((e) => e.id)).toEqual(['r1', 'r2', 'r3']);
    expect(readElementById(doc, 'r1')).toMatchObject({
      createdBy: 'alice',
      updatedBy: 'alice',
      updatedAt: 1000,
    });
  });

  it('updatedAt luôn là số nguyên theo hợp đồng schema', () => {
    const doc = new Y.Doc();
    addElement(doc, make('rect', 'r1'), ctxOf('alice', { now: 1000.6 }));
    expect(readElementById(doc, 'r1')?.updatedAt).toBe(1001);
  });

  it('không tin createdBy do caller đưa vào', () => {
    const doc = new Y.Doc();
    addElement(doc, make('rect', 'r1', {}, 'mallory'), alice);
    expect(readElementById(doc, 'r1')?.createdBy).toBe('alice');
  });

  it('từ chối phần tử hỏng và id trùng, không ghi gì', () => {
    const doc = new Y.Doc();
    expect(addElement(doc, make('rect', 'bad', { w: Number.NaN }), alice)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    addElement(doc, make('rect', 'r1'), alice);
    expect(addElement(doc, make('rect', 'r1'), alice)).toEqual({ ok: false, reason: 'exists' });
    expect(addElements(doc, [make('rect', 'x'), make('rect', 'x')], alice)).toEqual({
      ok: false,
      reason: 'exists',
    });
    expect(countElements(doc)).toBe(1);
  });
});

describe('WB-02 — trần phần tử', () => {
  it('chặn thêm khi đủ trần và báo max', () => {
    const doc = new Y.Doc();
    const ctx = ctxOf('alice', { elementsMax: 3 });
    for (const id of ['a', 'b', 'c']) expect(addElement(doc, make('rect', id), ctx).ok).toBe(true);
    expect(addElement(doc, make('rect', 'd'), ctx)).toEqual({ ok: false, reason: 'limit', max: 3 });
    expect(countElements(doc)).toBe(3);
    expect(remainingCapacity(doc, 3)).toBe(0);
  });

  it('thêm cả nhóm là tất cả hoặc không gì: 2 phần tử vào 1 chỗ trống thì từ chối cả hai', () => {
    const doc = new Y.Doc();
    const ctx = ctxOf('alice', { elementsMax: 3 });
    addElements(doc, [make('rect', 'a'), make('rect', 'b')], ctx);
    expect(addElements(doc, [make('rect', 'c'), make('rect', 'd')], ctx).ok).toBe(false);
    expect(countElements(doc)).toBe(2);
    expect(remainingCapacity(doc, 3)).toBe(1);
  });

  it('trần mặc định là 5000: thêm đủ 5000 được, phần tử thứ 5001 bị chặn', () => {
    const doc = new Y.Doc();
    const batch = Array.from({ length: WB_LIMITS.elementsMax }, (_, i) =>
      make('rect', `e${String(i)}`),
    );
    expect(addElements(doc, batch, alice)).toEqual({ ok: true });
    expect(addElement(doc, make('rect', 'extra'), alice)).toEqual({
      ok: false,
      reason: 'limit',
      max: 5000,
    });
    expect(countElements(doc)).toBe(5000);
  });
});
