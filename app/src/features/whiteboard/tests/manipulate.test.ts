import {
  applyPatch,
  elementCorners,
  moveElements,
  moveLineEndpoint,
  resizeBox,
  rotateElement,
  rotatePoint,
} from '../engine';
import { make } from './support';

describe('moveElements', () => {
  it('dời x,y; phần tử khoá không dời', () => {
    const a = make('rect', 'a', { x: 10, y: 10 });
    const b = make('rect', 'b', { locked: true });
    const patches = moveElements([a, b], 5, -3);
    expect(patches.get('a')).toEqual({ x: 15, y: 7 });
    expect(patches.has('b')).toBe(false);
  });

  it('mũi tên dính vào hình KHÔNG dời cùng thì bị gỡ dính; dời cùng thì giữ', () => {
    const shape = make('rect', 's');
    const arrow = make('arrow', 'ar', {
      startBinding: { elementId: 's' },
      endBinding: { elementId: 'gone' },
    });
    const alone = moveElements([arrow], 1, 1).get('ar');
    expect('startBinding' in (alone ?? {})).toBe(true);
    expect(alone?.startBinding).toBeUndefined();
    const together = moveElements([arrow, shape], 1, 1).get('ar');
    expect('startBinding' in (together ?? {})).toBe(false);
    expect('endBinding' in (together ?? {})).toBe(true);
  });
});

describe('resizeBox', () => {
  const rect = make('rect', 'r'); // 100×50 tại gốc

  it('kéo góc phải-dưới: neo là góc trái-trên', () => {
    expect(resizeBox(rect, 'se', { x: 150, y: 100 })).toEqual({ x: 0, y: 0, w: 150, h: 100 });
  });

  it('kéo góc trái-trên: neo là góc phải-dưới', () => {
    expect(resizeBox(rect, 'nw', { x: 20, y: 10 })).toEqual({ x: 20, y: 10, w: 80, h: 40 });
  });

  it('kéo cạnh phải chỉ đổi chiều rộng', () => {
    expect(resizeBox(rect, 'e', { x: 200, y: 999 })).toEqual({ x: 0, y: 0, w: 200, h: 50 });
  });

  it('không nhỏ hơn minSize và không lật ngược', () => {
    const out = resizeBox(rect, 'se', { x: -50, y: -50 });
    expect(out.w).toBe(8);
    expect(out.h).toBe(8);
  });

  it('keepAspect ở góc giữ tỉ lệ 2:1', () => {
    expect(resizeBox(rect, 'se', { x: 200, y: 60 }, { keepAspect: true })).toEqual({
      x: 0,
      y: 0,
      w: 200,
      h: 100,
    });
  });

  it('hình đang xoay: điểm neo đứng yên và góc kéo bám con trỏ', () => {
    const tilted = make('rect', 't', { rotation: 30 });
    const anchorBefore = elementCorners(tilted)[0];
    const a = anchorBefore ?? { x: 0, y: 0 };
    const pointer = rotatePoint({ x: a.x + 200, y: a.y + 80 }, a, 30);
    const next = applyPatch(tilted, resizeBox(tilted, 'se', pointer));
    expect(next.w).toBeCloseTo(200);
    expect(next.h).toBeCloseTo(80);
    const corners = elementCorners(next);
    expect(corners[0]?.x).toBeCloseTo(a.x, 1);
    expect(corners[0]?.y).toBeCloseTo(a.y, 1);
    expect(corners[2]?.x).toBeCloseTo(pointer.x, 1);
    expect(corners[2]?.y).toBeCloseTo(pointer.y, 1);
  });

  it('nét vẽ tay co giãn cả điểm theo tỉ lệ', () => {
    const stroke = make('freehand', 'f', { w: 10, h: 10, points: [0, 0, 10, 10] });
    expect(resizeBox(stroke, 'se', { x: 20, y: 30 }).points).toEqual([0, 0, 20, 30]);
  });

  it('đường/mũi tên không đổi cỡ bằng hộp (dùng kéo đầu mút)', () => {
    expect(resizeBox(make('line', 'l'), 'se', { x: 9, y: 9 })).toEqual({});
  });
});

describe('rotateElement', () => {
  const rect = make('rect', 'r'); // tâm (50,25)

  it('con trỏ phía trên tâm = 0°, phải = 90°, dưới = 180°, trái = 270°', () => {
    expect(rotateElement(rect, { x: 50, y: -100 }).rotation).toBe(0);
    expect(rotateElement(rect, { x: 200, y: 25 }).rotation).toBe(90);
    expect(rotateElement(rect, { x: 50, y: 100 }).rotation).toBe(180);
    expect(rotateElement(rect, { x: -100, y: 25 }).rotation).toBe(270);
  });

  it('snapDeg làm tròn về bội số góc', () => {
    const p = rotatePoint({ x: 250, y: 25 }, { x: 50, y: 25 }, 10); // hướng 10° dưới trục x ⇒ góc xoay 100°
    expect(rotateElement(rect, p).rotation).toBe(100);
    expect(rotateElement(rect, p, 15).rotation).toBe(105);
  });
});

describe('moveLineEndpoint', () => {
  it('kéo đầu cuối hoặc đầu đầu, đầu kia đứng yên', () => {
    const line = make('line', 'l', { w: 100, h: 0 });
    expect(moveLineEndpoint(line, 'end', { x: 100, y: 50 })).toEqual({
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      rotation: 0,
    });
    expect(moveLineEndpoint(line, 'start', { x: 10, y: 10 })).toEqual({
      x: 10,
      y: 10,
      w: 90,
      h: -10,
      rotation: 0,
    });
  });
});
