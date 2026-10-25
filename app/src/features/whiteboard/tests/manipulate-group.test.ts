import { resizeGroup, rotateElements, rotationDelta, selectionBox } from '../engine';
import { make } from './support';

describe('thao tác nhóm', () => {
  const a = make('rect', 'a', { w: 10, h: 10 });
  const b = make('rect', 'b', { x: 20, w: 10, h: 10 });

  it('selectionBox là hộp bao của cả nhóm', () => {
    expect(selectionBox([a, b])).toEqual({ x: 0, y: 0, w: 30, h: 10 });
    expect(selectionBox([])).toBeNull();
  });

  it('xoay nhóm 90° quanh tâm nhóm: tâm từng hình quay quanh tâm nhóm, rotation cộng góc', () => {
    const patches = rotateElements([a, b], { x: 15, y: 5 }, 90);
    expect(patches.get('a')).toEqual({ x: 10, y: -10, rotation: 90 });
    expect(patches.get('b')).toEqual({ x: 10, y: 10, rotation: 90 });
  });

  it('rotationDelta đo góc quay giữa hai hướng', () => {
    expect(rotationDelta({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90);
  });

  it('co giãn nhóm theo cạnh phải: hình dời và giãn cùng tỉ lệ, neo là cạnh trái', () => {
    const box = selectionBox([a, b]) ?? { x: 0, y: 0, w: 0, h: 0 };
    const patches = resizeGroup([a, b], box, 'e', { x: 60, y: 5 });
    expect(patches.get('a')).toEqual({ x: 0, y: 0, w: 20, h: 10 });
    expect(patches.get('b')).toEqual({ x: 40, y: 0, w: 20, h: 10 });
  });
});
