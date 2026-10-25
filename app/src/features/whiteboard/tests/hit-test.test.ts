import {
  elementsInRect,
  handlePositions,
  hitTestElement,
  hitTestHandle,
  hitTestTopmost,
} from '../engine';
import { make } from './support';

describe('hitTestElement — hình xoay', () => {
  // Hộp 100×20 xoay 90° quanh tâm (50,10) thành dải đứng x ∈ [40,60], y ∈ [-40,60].
  const bar = make('rect', 'bar', { w: 100, h: 20, rotation: 90, fillColor: 'blue' });

  it('trúng chỗ hộp CHƯA xoay không phủ tới nhưng hộp đã xoay phủ tới', () => {
    expect(hitTestElement(bar, { x: 50, y: 50 })).toBe(true);
  });

  it('trượt chỗ hộp chưa xoay phủ nhưng hộp đã xoay đã rời đi', () => {
    expect(hitTestElement(bar, { x: 10, y: 10 })).toBe(false);
  });
});

describe('hitTestElement — theo loại', () => {
  it('hình chữ nhật KHÔNG tô chỉ trúng ở viền; tolerance nới viền', () => {
    const r = make('rect', 'r', { w: 100, h: 100 });
    expect(hitTestElement(r, { x: 50, y: 50 })).toBe(false);
    expect(hitTestElement(r, { x: 0, y: 50 })).toBe(true);
    expect(hitTestElement(r, { x: 3, y: 50 }, 4)).toBe(true);
    expect(hitTestElement(r, { x: 50, y: 50 }, 4)).toBe(false);
  });

  it('hình chữ nhật CÓ tô trúng ở bên trong', () => {
    expect(hitTestElement(make('rect', 'r', { fillColor: 'red' }), { x: 50, y: 25 })).toBe(true);
  });

  it('ellipse tô: trúng tâm, trượt góc hộp', () => {
    const e = make('ellipse', 'e', { fillColor: 'red' });
    expect(hitTestElement(e, { x: 50, y: 25 })).toBe(true);
    expect(hitTestElement(e, { x: 2, y: 2 })).toBe(false);
  });

  it('khung (frame) luôn chỉ trúng ở viền dù có tô', () => {
    const f = make('frame', 'f', { w: 200, h: 200, fillColor: 'blue' });
    expect(hitTestElement(f, { x: 100, y: 100 })).toBe(false);
    expect(hitTestElement(f, { x: 0, y: 100 })).toBe(true);
  });

  it('giấy nhớ và chữ trúng cả hộp', () => {
    expect(hitTestElement(make('sticky', 's'), { x: 60, y: 30 })).toBe(true);
    expect(hitTestElement(make('text', 't'), { x: 101, y: 30 })).toBe(false);
  });

  it('đường chéo: trúng gần nét, tolerance nới ra', () => {
    const line = make('line', 'l', { w: 100, h: 100 });
    expect(hitTestElement(line, { x: 50, y: 50 })).toBe(true);
    expect(hitTestElement(line, { x: 50, y: 52 })).toBe(false);
    expect(hitTestElement(line, { x: 50, y: 52 }, 2)).toBe(true);
  });

  it('nét vẽ tay: trúng dọc nét, trượt chỗ trống trong hộp bao', () => {
    const stroke = make('freehand', 'f', {
      x: 10,
      y: 10,
      w: 50,
      h: 50,
      points: [0, 0, 50, 0, 50, 50],
    });
    expect(hitTestElement(stroke, { x: 35, y: 10 })).toBe(true);
    expect(hitTestElement(stroke, { x: 60, y: 40 })).toBe(true);
    expect(hitTestElement(stroke, { x: 25, y: 45 })).toBe(false);
  });
});

describe('hitTestTopmost', () => {
  const bottom = make('rect', 'bottom', { fillColor: 'red' });
  const top = make('rect', 'top', { fillColor: 'blue' });
  const p = { x: 50, y: 25 };

  it('trả phần tử trên cùng theo thứ tự z', () => {
    expect(hitTestTopmost([bottom, top], p)?.id).toBe('top');
  });

  it('bỏ qua phần tử khoá trừ khi includeLocked', () => {
    const locked = { ...top, locked: true };
    expect(hitTestTopmost([bottom, locked], p)?.id).toBe('bottom');
    expect(hitTestTopmost([bottom, locked], p, { includeLocked: true })?.id).toBe('top');
  });

  it('không trúng gì trả null', () => {
    expect(hitTestTopmost([bottom, top], { x: 500, y: 500 })).toBeNull();
  });
});

describe('elementsInRect', () => {
  const small = make('rect', 'small', { w: 10, h: 10 });
  const far = make('rect', 'far', { x: 100, y: 100, w: 10, h: 10 });
  const diagonal = make('line', 'diag', { w: 100, h: 100 });
  const ids = (list: { id: string }[]): string[] => list.map((e) => e.id);

  it('contain: chỉ phần tử nằm trọn trong khung', () => {
    expect(
      ids(elementsInRect([small, far, diagonal], { x: -5, y: -5, w: 30, h: 30 }, 'contain')),
    ).toEqual(['small']);
  });

  it('intersect: cả đường chéo cắt khung, không lấy hình xa', () => {
    expect(ids(elementsInRect([small, far, diagonal], { x: -5, y: -5, w: 30, h: 30 }))).toEqual([
      'small',
      'diag',
    ]);
  });

  it('khung nằm trong hộp bao của đường chéo nhưng không chạm đường thì không chọn', () => {
    expect(elementsInRect([diagonal], { x: 80, y: 0, w: 20, h: 20 })).toEqual([]);
  });
});

describe('tay nắm', () => {
  const box = { x: 0, y: 0, w: 100, h: 50 };

  it('vị trí các tay nắm khi chưa xoay, tay nắm xoay treo trên cạnh trên', () => {
    const pos = handlePositions(box, 0, 24);
    expect(pos.nw).toEqual({ x: 0, y: 0 });
    expect(pos.se).toEqual({ x: 100, y: 50 });
    expect(pos.rotate).toEqual({ x: 50, y: -24 });
  });

  it('bắt trúng tay nắm gần con trỏ, null khi ở giữa hộp', () => {
    expect(hitTestHandle(box, 0, { x: 101, y: 49 }, 5)).toBe('se');
    expect(hitTestHandle(box, 0, { x: 50, y: -24 }, 5)).toBe('rotate');
    expect(hitTestHandle(box, 0, { x: 50, y: 25 }, 5)).toBeNull();
  });

  it('tay nắm đi theo góc xoay: cạnh phải xoay 90° nằm ở dưới tâm', () => {
    expect(hitTestHandle(box, 90, { x: 50, y: 75 }, 3)).toBe('e');
  });
});
