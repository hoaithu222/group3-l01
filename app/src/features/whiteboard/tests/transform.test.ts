import {
  cullElements,
  fitCamera,
  INITIAL_CAMERA,
  panBy,
  parseCamera,
  pinchCamera,
  screenToWorld,
  toWorldTolerance,
  visibleWorldRect,
  worldToScreen,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomBy,
  zoomTo,
} from '../engine';
import { make } from './support';

describe('camera world ↔ screen', () => {
  const cam = { x: 30, y: -40, zoom: 2.5 };

  it('khứ hồi world → screen → world giữ nguyên điểm', () => {
    const world = { x: 12.3, y: -7 };
    const back = screenToWorld(cam, worldToScreen(cam, world));
    expect(back.x).toBeCloseTo(world.x);
    expect(back.y).toBeCloseTo(world.y);
  });

  it('screen = world × zoom + (x, y)', () => {
    expect(worldToScreen(cam, { x: 10, y: 10 })).toEqual({ x: 55, y: -15 });
  });

  it('panBy chỉ dời gốc, không đổi zoom', () => {
    expect(panBy(cam, 5, -5)).toEqual({ x: 35, y: -45, zoom: 2.5 });
  });
});

describe('zoom', () => {
  it('điểm thế giới dưới tiêu điểm đứng yên khi zoom', () => {
    const cam = { x: 40, y: 20, zoom: 1 };
    const focal = { x: 200, y: 100 };
    const before = screenToWorld(cam, focal);
    const next = zoomBy(cam, 3, focal);
    expect(next.zoom).toBe(3);
    const after = worldToScreen(next, before);
    expect(after.x).toBeCloseTo(focal.x);
    expect(after.y).toBeCloseTo(focal.y);
  });

  it('kẹp trong 0.1×–4×', () => {
    expect(zoomTo(INITIAL_CAMERA, 100, { x: 0, y: 0 }).zoom).toBe(ZOOM_MAX);
    expect(zoomTo(INITIAL_CAMERA, 0.001, { x: 0, y: 0 }).zoom).toBe(ZOOM_MIN);
  });

  it('chụm 2 ngón: zoom theo tỉ lệ khoảng cách, điểm dưới tâm hai ngón đi theo tâm mới', () => {
    const next = pinchCamera(INITIAL_CAMERA, { x: 100, y: 100 }, 100, { x: 150, y: 120 }, 200);
    expect(next).toEqual({ x: -50, y: -80, zoom: 2 });
  });

  it('chụm khi khoảng cách ban đầu bằng 0 không chia cho 0', () => {
    expect(pinchCamera(INITIAL_CAMERA, { x: 0, y: 0 }, 0, { x: 0, y: 0 }, 50).zoom).toBe(1);
  });
});

describe('khung nhìn', () => {
  it('visibleWorldRect chia kích thước khung cho zoom', () => {
    expect(visibleWorldRect({ x: -100, y: -50, zoom: 2 }, { width: 400, height: 200 })).toEqual({
      x: 50,
      y: 25,
      w: 200,
      h: 100,
    });
  });

  it('cullElements chỉ giữ phần tử giao vùng nhìn, giữ thứ tự z', () => {
    const near = make('rect', 'near', { w: 10, h: 10 });
    const far = make('rect', 'far', { x: 1000, y: 1000, w: 10, h: 10 });
    const edge = make('rect', 'edge', { x: 105, y: 0, w: 10, h: 10, strokeWidth: 12 });
    const out = cullElements([near, far, edge], { x: 0, y: 0, w: 100, h: 100 });
    expect(out.map((e) => e.id)).toEqual(['near', 'edge']);
  });

  it('fitCamera căn giữa nội dung và không phóng quá maxZoom', () => {
    const view = { width: 500, height: 500 };
    expect(fitCamera({ x: 0, y: 0, w: 1000, h: 500 }, view, 50)).toEqual({
      x: 50,
      y: 150,
      zoom: 0.4,
    });
    expect(fitCamera({ x: 0, y: 0, w: 10, h: 10 }, view, 50).zoom).toBe(1);
    expect(fitCamera(null, view)).toEqual(INITIAL_CAMERA);
  });

  it('toWorldTolerance: 8 px ở zoom 2 là 4 đơn vị thế giới', () => {
    expect(toWorldTolerance(8, { x: 0, y: 0, zoom: 2 })).toBe(4);
  });
});

describe('parseCamera (viewport lưu AsyncStorage)', () => {
  it('nhận camera hợp lệ và kẹp zoom', () => {
    expect(parseCamera({ x: 1, y: 2, zoom: 1.5 })).toEqual({ x: 1, y: 2, zoom: 1.5 });
    expect(parseCamera({ x: 1, y: 2, zoom: 99 })?.zoom).toBe(ZOOM_MAX);
  });

  it.each([
    null,
    'x',
    {},
    { x: 1, y: 2, zoom: 0 },
    { x: Number.NaN, y: 0, zoom: 1 },
    { x: '1', y: 0, zoom: 1 },
  ])('từ chối dữ liệu hỏng %p', (raw) => {
    expect(parseCamera(raw)).toBeNull();
  });
});
