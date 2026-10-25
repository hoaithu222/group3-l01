import * as Y from 'yjs';

import {
  addElement,
  createHistory,
  readElementById,
  readElements,
  removeElements,
  updateElements,
} from '../engine';
import { ctxOf, make, sync } from './support';

const alice = ctxOf('alice');
const bob = ctxOf('bob');
const ids = (doc: Y.Doc): string[] => readElements(doc).map((e) => e.id);

describe('WB-03 — undo chỉ hoàn tác thao tác của mình', () => {
  it('Alice vẽ a, Bob vẽ b: undo của Alice chỉ xoá a; b của Bob còn nguyên ở cả hai máy', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const undoAlice = createHistory(a, 'alice');
    const undoBob = createHistory(b, 'bob');
    addElement(a, make('rect', 'a'), alice);
    sync(a, b);
    addElement(b, make('rect', 'b'), bob);
    sync(a, b);

    expect(undoAlice.canUndo()).toBe(true);
    expect(undoAlice.undo()).toBe('done');
    sync(a, b);
    expect(ids(a)).toEqual(['b']);
    expect(ids(b)).toEqual(['b']);
    expect(undoAlice.undo()).toBe('empty');
    expect(undoAlice.canUndo()).toBe(false);
    expect(undoBob.canUndo()).toBe(true);
  });

  it('thao tác nhận từ mạng (origin khác) không lọt vào ngăn xếp của mình', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const undoAlice = createHistory(a, 'alice');
    addElement(b, make('rect', 'fromBob'), bob);
    sync(a, b);
    expect(undoAlice.canUndo()).toBe(false);
  });

  it('hai người sửa hai trường khác nhau của một hình: undo chỉ trả lại trường CỦA MÌNH', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    addElement(a, make('rect', 'r'), alice);
    sync(a, b);
    const undoAlice = createHistory(a, 'alice');
    updateElements(a, new Map([['r', { fillColor: 'red' }]]), alice);
    updateElements(b, new Map([['r', { x: 200 }]]), bob);
    sync(a, b);
    undoAlice.undo();
    expect(readElementById(a, 'r')).toMatchObject({ fillColor: null, x: 200 });
  });
});

describe('createHistory', () => {
  it('mỗi thao tác là MỘT bước dù làm liên tiếp rất nhanh (captureTimeout 0)', () => {
    const doc = new Y.Doc();
    const history = createHistory(doc, 'alice');
    addElement(doc, make('rect', 'a'), alice);
    addElement(doc, make('rect', 'b'), alice);
    history.undo();
    expect(ids(doc)).toEqual(['a']);
  });

  it('undo rồi redo trả đúng phần tử, kể cả phần tử bị xoá', () => {
    const doc = new Y.Doc();
    const history = createHistory(doc, 'alice');
    addElement(doc, make('rect', 'a', { x: 42 }), alice);
    removeElements(doc, ['a'], alice);
    expect(ids(doc)).toEqual([]);
    expect(history.undo()).toBe('done');
    expect(readElementById(doc, 'a')?.x).toBe(42);
    expect(history.canRedo()).toBe(true);
    expect(history.redo()).toBe('done');
    expect(ids(doc)).toEqual([]);
    expect(history.redo()).toBe('empty');
  });

  it('thao tác mới sau undo xoá ngăn redo', () => {
    const doc = new Y.Doc();
    const history = createHistory(doc, 'alice');
    addElement(doc, make('rect', 'a'), alice);
    history.undo();
    addElement(doc, make('rect', 'b'), alice);
    expect(history.canRedo()).toBe(false);
  });

  it('subscribe báo thay đổi ngăn xếp; clear và hủy đăng ký hoạt động', () => {
    const doc = new Y.Doc();
    const history = createHistory(doc, 'alice');
    const listener = jest.fn();
    const off = history.subscribe(listener);
    addElement(doc, make('rect', 'a'), alice);
    expect(listener).toHaveBeenCalled();
    history.clear();
    expect(history.canUndo()).toBe(false);
    listener.mockClear();
    off();
    addElement(doc, make('rect', 'b'), alice);
    expect(listener).not.toHaveBeenCalled();
    history.destroy();
  });

  it('WB-02: hoàn tác một lần xoá mà bảng đã đầy chỗ trống thì đảo lại và báo "limit"', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const ctxA = ctxOf('alice', { elementsMax: 2 });
    const ctxB = ctxOf('bob', { elementsMax: 2 });
    const history = createHistory(a, 'alice', 2);
    addElement(a, make('rect', 'x'), ctxA);
    addElement(a, make('rect', 'y'), ctxA);
    removeElements(a, ['x'], ctxA);
    sync(a, b);
    addElement(b, make('rect', 'z'), ctxB);
    sync(a, b);
    expect(ids(a).sort()).toEqual(['y', 'z']);

    expect(history.undo()).toBe('limit');
    expect(ids(a).sort()).toEqual(['y', 'z']);
    expect(history.canUndo()).toBe(true);
  });
});
