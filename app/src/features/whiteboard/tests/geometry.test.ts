import {
  distanceToSegment,
  elementBounds,
  endpointsToFields,
  lineEndpoints,
  normalizeAngle,
  normalizeRect,
  polygonsIntersect,
  rectCorners,
  rotatePoint,
} from '../engine';
import { make } from './support';

describe('rotatePoint', () => {
  it('góc dương xoay theo chiều kim đồng hồ trên màn hình (trục y hướng xuống)', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
  });

  it('góc 0 trả bản sao, không đổi', () => {
    expect(rotatePoint({ x: 3, y: 4 }, { x: 1, y: 1 }, 0)).toEqual({ x: 3, y: 4 });
  });
});

describe('normalizeAngle / normalizeRect', () => {
  it('đưa góc về [0, 360)', () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(725)).toBe(5);
    expect(Object.is(normalizeAngle(-0), 0)).toBe(true);
  });

  it('w,h âm thành hộp thường', () => {
    expect(normalizeRect({ x: 10, y: 10, w: -4, h: -6 })).toEqual({ x: 6, y: 4, w: 4, h: 6 });
  });
});

describe('hộp bao', () => {
  it('hộp 100×50 xoay 90° quanh tâm thành 50×100', () => {
    const b = elementBounds(make('rect', 'r', { rotation: 90 }));
    expect(b.x).toBeCloseTo(25);
    expect(b.y).toBeCloseTo(-25);
    expect(b.w).toBeCloseTo(50);
    expect(b.h).toBeCloseTo(100);
  });

  it('rectCorners trả trái-trên, phải-trên, phải-dưới, trái-dưới khi chưa xoay', () => {
    expect(rectCorners({ x: 0, y: 0, w: 4, h: 2 })).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ]);
  });
});

describe('polygonsIntersect', () => {
  const square = rectCorners({ x: 0, y: 0, w: 10, h: 10 });

  it('hai hình vuông chồng nhau / tách nhau', () => {
    expect(polygonsIntersect(square, rectCorners({ x: 5, y: 5, w: 10, h: 10 }))).toBe(true);
    expect(polygonsIntersect(square, rectCorners({ x: 20, y: 0, w: 10, h: 10 }))).toBe(false);
  });

  it('hình xoay 45° chỉ chạm hộp trục khi thật sự giao', () => {
    const diamond = rectCorners({ x: 11, y: 0, w: 10, h: 10 }, 45);
    expect(polygonsIntersect(square, diamond)).toBe(true);
    expect(polygonsIntersect(square, rectCorners({ x: 13, y: 0, w: 10, h: 10 }, 45))).toBe(false);
  });

  it('đoạn thẳng cắt / không cắt hình vuông', () => {
    expect(
      polygonsIntersect(
        [
          { x: -1, y: 5 },
          { x: 20, y: 5 },
        ],
        square,
      ),
    ).toBe(true);
    expect(
      polygonsIntersect(
        [
          { x: 20, y: 20 },
          { x: 30, y: 30 },
        ],
        square,
      ),
    ).toBe(false);
  });
});

describe('distanceToSegment', () => {
  it('tới thân, tới đầu mút, và đoạn suy biến', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distanceToSegment({ x: 5, y: 5 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 15, y: 0 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
  });
});

describe('lineEndpoints / endpointsToFields', () => {
  it('tính xoay vào hai đầu và khứ hồi qua endpointsToFields (rotation về 0)', () => {
    const line = make('line', 'l', { x: 10, y: 20, w: 100, h: 0, rotation: 90 });
    const { start, end } = lineEndpoints(line);
    expect(start.x).toBeCloseTo(60);
    expect(start.y).toBeCloseTo(-30);
    expect(end.x).toBeCloseTo(60);
    expect(end.y).toBeCloseTo(70);
    const back = lineEndpoints({ ...line, ...endpointsToFields(start, end) });
    expect(back.start.x).toBeCloseTo(start.x);
    expect(back.end.y).toBeCloseTo(end.y);
  });

  it('đường chéo ngược có h âm vẫn đúng hai đầu', () => {
    const line = make('line', 'l', { x: 100, y: 100, w: -100, h: -100 });
    expect(lineEndpoints(line)).toEqual({ start: { x: 100, y: 100 }, end: { x: 0, y: 0 } });
  });
});
