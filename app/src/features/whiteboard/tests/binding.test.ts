import {
  bindingPoint,
  dragArrowEndpoint,
  findBindingTarget,
  moveElements,
  resolveArrow,
  withArrowRebinding,
} from '../engine';
import { make } from './support';

const A = make('rect', 'A'); // 100×50 tại (0,0), tâm (50,25)
const B = make('rect', 'B', { x: 300 }); // tâm (350,25)
const arrow = make('arrow', 'ar', {
  w: 10,
  h: 10,
  startBinding: { elementId: 'A' },
  endBinding: { elementId: 'B' },
});

describe('bindingPoint', () => {
  it('hình chữ nhật: tia từ tâm cắt viền ở cạnh, ở góc khi đường chéo trúng góc', () => {
    const at = (x: number, y: number): [number, number] => {
      const p = bindingPoint(A, { x, y });
      return [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100];
    };
    expect(at(300, 25)).toEqual([100, 25]);
    expect(at(50, 200)).toEqual([50, 50]);
    expect(at(150, 75)).toEqual([100, 50]);
  });

  it('ellipse: cắt viền cong', () => {
    const e = make('ellipse', 'e');
    const p = bindingPoint(e, { x: 300, y: 25 });
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(25);
  });

  it('hình đang xoay 90°: cạnh phải của hộp xoay nằm ở x = 75', () => {
    const p = bindingPoint({ ...A, rotation: 90 }, { x: 300, y: 25 });
    expect(p.x).toBeCloseTo(75);
    expect(p.y).toBeCloseTo(25);
  });

  it('điểm trùng tâm trả về tâm (không chia cho 0)', () => {
    expect(bindingPoint(A, { x: 50, y: 25 })).toEqual({ x: 50, y: 25 });
  });
});

describe('resolveArrow', () => {
  it('cả hai đầu dính: mỗi đầu đậu ở viền hình, hướng về tâm hình kia', () => {
    const patch = resolveArrow(
      arrow,
      new Map([
        ['A', A],
        ['B', B],
      ]),
    );
    expect(patch).toEqual({ x: 100, y: 25, w: 200, h: 0, rotation: 0 });
  });

  it('hình bị xoá thì gỡ dính thay vì trỏ vào hư không', () => {
    const patch = resolveArrow(
      make('arrow', 'ar', { startBinding: { elementId: 'gone' } }),
      new Map(),
    );
    expect(patch).not.toBeNull();
    expect('startBinding' in (patch ?? {})).toBe(true);
    expect(patch?.startBinding).toBeUndefined();
  });

  it('mũi tên không dính gì, hoặc là đường thường: null', () => {
    expect(resolveArrow(make('arrow', 'x'), new Map())).toBeNull();
    expect(resolveArrow(make('line', 'l'), new Map([['A', A]]))).toBeNull();
  });
});

describe('withArrowRebinding — mũi tên đi theo hình khi hình di chuyển', () => {
  it('dời B xuống 100: mũi tên được vá cùng bản vá của B', () => {
    const elements = [A, B, arrow];
    const patches = withArrowRebinding(elements, moveElements([B], 0, 100));
    expect(patches.get('B')).toEqual({ x: 300, y: 100 });
    const fix = patches.get('ar');
    expect(fix?.x).toBeCloseTo(100, 1);
    expect(fix?.y).toBeCloseTo(41.67, 1);
    expect(fix?.w).toBeCloseTo(200, 1);
    expect(fix?.h).toBeCloseTo(66.67, 1);
  });

  it('không đụng mũi tên dính vào hình khác không đổi', () => {
    const other = make('arrow', 'other', { startBinding: { elementId: 'A' } });
    const patches = withArrowRebinding([A, B, arrow, other], moveElements([B], 0, 100));
    expect(patches.has('other')).toBe(false);
  });

  it('mũi tên và hình dời cùng nhau vẫn khớp hình', () => {
    const patches = withArrowRebinding([A, B, arrow], moveElements([A, B, arrow], 10, 10));
    const fix = patches.get('ar');
    expect(fix?.x).toBeCloseTo(110);
    expect(fix?.y).toBeCloseTo(35);
    expect(fix?.w).toBeCloseTo(200);
  });
});

describe('findBindingTarget / dragArrowEndpoint', () => {
  it('chọn hình dính được trên cùng dưới điểm, kể cả hình không tô; bỏ qua loại khác và exclude', () => {
    const line = make('line', 'l', { w: 100, h: 100 });
    expect(findBindingTarget([A, line], { x: 50, y: 25 })?.id).toBe('A');
    expect(findBindingTarget([A], { x: 50, y: 25 }, { exclude: ['A'] })).toBeNull();
    expect(findBindingTarget([line], { x: 50, y: 50 })).toBeNull();
  });

  it('thả đầu mũi tên trên hình thì dính và bật ra viền', () => {
    const free = make('arrow', 'ar', { w: 100, h: 0 });
    const patch = dragArrowEndpoint([A, B, free], free, 'end', { x: 350, y: 25 });
    expect(patch.endBinding).toEqual({ elementId: 'B' });
    expect(patch.x).toBe(0);
    expect(patch.w).toBeCloseTo(300, 1);
  });

  it('thả ra chỗ trống thì gỡ dính ở đầu đó', () => {
    const patch = dragArrowEndpoint([A, B, arrow], arrow, 'end', { x: 500, y: 500 });
    expect('endBinding' in patch).toBe(true);
    expect(patch.endBinding).toBeUndefined();
  });
});
