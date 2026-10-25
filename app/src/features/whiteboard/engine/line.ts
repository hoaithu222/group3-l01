import type { Vec2, WhiteboardElement } from './element.types';
import { elementCenter, rotatePoint, round2 } from './geometry';

/** Hai đầu của `line`/`arrow` trong toạ độ THẾ GIỚI (đã tính xoay). */
export function lineEndpoints(el: WhiteboardElement): { start: Vec2; end: Vec2 } {
  const c = elementCenter(el);
  return {
    start: rotatePoint({ x: el.x, y: el.y }, c, el.rotation),
    end: rotatePoint({ x: el.x + el.w, y: el.y + el.h }, c, el.rotation),
  };
}

/** Ngược của `lineEndpoints`: bản vá đặt hai đầu, và đưa `rotation` về 0 (xoay đã được "nướng" vào hai đầu). */
export function endpointsToFields(
  start: Vec2,
  end: Vec2,
): Pick<WhiteboardElement, 'x' | 'y' | 'w' | 'h' | 'rotation'> {
  return {
    x: round2(start.x),
    y: round2(start.y),
    w: round2(end.x - start.x),
    h: round2(end.y - start.y),
    rotation: 0,
  };
}
