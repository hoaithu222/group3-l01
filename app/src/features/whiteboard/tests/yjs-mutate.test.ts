import * as Y from 'yjs';

import {
  addElement,
  addElements,
  getBackground,
  readElementById,
  readElements,
  removeElements,
  setBackground,
  updateElements,
} from '../engine';
import { ctxOf, make } from './support';

const alice = ctxOf('alice');

describe('updateElements', () => {
  it('vá từng trường, kẹp giá trị, đóng dấu người sửa', () => {
    const doc = new Y.Doc();
    addElement(doc, make('rect', 'r'), alice);
    const bob = ctxOf('bob', { now: 2000 });
    const n = updateElements(
      doc,
      new Map([['r', { x: 7, strokeWidth: 99, fillColor: 'red' }]]),
      bob,
    );
    expect(n).toBe(1);
    expect(readElementById(doc, 'r')).toMatchObject({
      x: 7,
      strokeWidth: 12,
      fillColor: 'red',
      createdBy: 'alice',
      updatedBy: 'bob',
      updatedAt: 2000,
    });
  });

  it('giá trị không đổi thì không ghi gì (không sinh update rỗng)', () => {
    const doc = new Y.Doc();
    addElement(doc, make('rect', 'r'), alice);
    const onUpdate = jest.fn();
    doc.on('update', onUpdate);
    expect(updateElements(doc, new Map([['r', { x: 0, fillColor: null }]]), alice)).toBe(0);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('khoá undefined xoá trường; phần tử không tồn tại thì bỏ qua', () => {
    const doc = new Y.Doc();
    addElement(doc, make('arrow', 'a', { startBinding: { elementId: 'r' } }), alice);
    updateElements(
      doc,
      new Map([
        ['a', { startBinding: undefined }],
        ['ghost', { x: 1 }],
      ]),
      alice,
    );
    expect(readElementById(doc, 'a')?.startBinding).toBeUndefined();
    expect(readElementById(doc, 'ghost')).toBeNull();
  });
});

describe('removeElements', () => {
  it('xoá khỏi elements và order, gỡ dính mũi tên trỏ vào phần tử bị xoá', () => {
    const doc = new Y.Doc();
    addElements(
      doc,
      [
        make('rect', 'r'),
        make('rect', 's'),
        make('arrow', 'a', {
          startBinding: { elementId: 'r' },
          endBinding: { elementId: 's' },
        }),
      ],
      alice,
    );
    expect(removeElements(doc, ['r', 'nope'], alice)).toBe(1);
    expect(readElements(doc).map((e) => e.id)).toEqual(['s', 'a']);
    const arrow = readElementById(doc, 'a');
    expect(arrow?.startBinding).toBeUndefined();
    expect(arrow?.endBinding).toEqual({ elementId: 's' });
  });
});

describe('nền canvas', () => {
  it('mặc định grid, đổi được, từ chối giá trị lạ', () => {
    const doc = new Y.Doc();
    expect(getBackground(doc)).toBe('grid');
    expect(setBackground(doc, 'dots', alice)).toBe(true);
    expect(getBackground(doc)).toBe('dots');
    expect(setBackground(doc, 'neon' as never, alice)).toBe(false);
  });
});
