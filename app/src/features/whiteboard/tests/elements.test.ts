import {
  applyPatch,
  createElement,
  estimateTextSize,
  newElementId,
  parseElement,
  sanitizePatch,
  WB_LIMITS,
} from '../engine';
import { make } from './support';

describe('createElement', () => {
  it('đặt mặc định theo loại và đóng dấu người tạo', () => {
    const rect = createElement('rect', { id: 'r' }, { userId: 'u1', now: 5 });
    expect(rect).toMatchObject({
      id: 'r',
      type: 'rect',
      w: 160,
      h: 100,
      rotation: 0,
      strokeColor: 'ink',
      fillColor: null,
      strokeWidth: 2,
      createdBy: 'u1',
      updatedBy: 'u1',
      updatedAt: 5,
    });
    expect(rect.points).toBeUndefined();
  });

  it('giấy nhớ tô vàng, có chữ và cỡ chữ mặc định', () => {
    const sticky = createElement('sticky', { id: 's', text: 'ý tưởng' }, { userId: 'u1' });
    expect(sticky).toMatchObject({
      fillColor: 'yellow',
      w: 160,
      h: 160,
      text: 'ý tưởng',
      fontSize: 20,
    });
  });

  it('chữ chưa có kích thước thì ước lượng theo nội dung', () => {
    const text = createElement(
      'text',
      { id: 't', text: 'abcd\nab', fontSize: 20 },
      { userId: 'u' },
    );
    expect(text.w).toBeCloseTo(4 * 20 * 0.6);
    expect(text.h).toBeCloseTo(2 * 20 * 1.25);
    expect(estimateTextSize('', 20)).toEqual({ w: 20, h: 25 });
  });

  it('newElementId khác nhau giữa các lần gọi và dùng được rand tiêm vào', () => {
    expect(newElementId(() => 0, 0)).toBe('0' + '00000000');
    expect(new Set(Array.from({ length: 200 }, () => newElementId())).size).toBe(200);
  });
});

describe('sanitizePatch', () => {
  it('kẹp độ dày nét, cỡ chữ và cắt chữ quá dài', () => {
    const out = sanitizePatch({ strokeWidth: 99, fontSize: 1, text: 'x'.repeat(5000) });
    expect(out.strokeWidth).toBe(WB_LIMITS.strokeWidthMax);
    expect(out.fontSize).toBe(WB_LIMITS.fontSizeMin);
    expect(out.text).toHaveLength(WB_LIMITS.textMax);
  });

  it('bỏ giá trị không hữu hạn và khoá lạ, chuẩn hoá góc, giữ undefined (= xoá trường)', () => {
    const out = sanitizePatch({
      x: Number.NaN,
      y: 5,
      rotation: -90,
      startBinding: undefined,
      ...({ id: 'hack', foo: 1 } as object),
    });
    expect(out).toEqual({ y: 5, rotation: 270, startBinding: undefined });
    expect('x' in out).toBe(false);
    expect('startBinding' in out).toBe(true);
  });

  it('cắt points quá 1000 số và bỏ số lẻ cuối', () => {
    expect(
      sanitizePatch({ points: Array.from({ length: 1500 }, (_, i) => i) }).points,
    ).toHaveLength(1000);
    expect(sanitizePatch({ points: [1, 2, 3] }).points).toEqual([1, 2]);
  });
});

describe('parseElement', () => {
  const base = { id: 'a', type: 'rect', x: 1, y: 2, w: 3, h: 4 };

  it('đọc bản hợp lệ, điền mặc định cho trường thiếu', () => {
    expect(parseElement(base)).toMatchObject({
      strokeColor: 'ink',
      fillColor: null,
      strokeWidth: 2,
    });
  });

  it.each([
    ['không phải object', 'abc'],
    ['loại lạ', { ...base, type: 'hexagon' }],
    ['w không phải số', { ...base, w: 'abc' }],
    ['toạ độ Infinity', { ...base, x: Infinity }],
    ['id rỗng', { ...base, id: '' }],
    ['freehand thiếu points', { ...base, type: 'freehand' }],
  ])('từ chối %s', (_name, raw) => {
    expect(parseElement(raw)).toBeNull();
  });

  it('id sai định dạng schema (khoảng trắng, quá dài) bị từ chối', () => {
    expect(parseElement({ ...base, id: 'a b' })).toBeNull();
    expect(parseElement({ ...base, id: 'x'.repeat(65) })).toBeNull();
    expect(parseElement({ ...base, id: 'x'.repeat(64) })).not.toBeNull();
  });

  it('id token màu sai dạng rơi về mặc định; assetId phải là ObjectId 24 hex', () => {
    const el = parseElement({ ...base, strokeColor: 'Red!', fillColor: '#fff', assetId: 'abc' });
    expect(el).toMatchObject({ strokeColor: 'ink', fillColor: null });
    expect(el?.assetId).toBeUndefined();
    expect(parseElement({ ...base, assetId: '0123456789abcdef01234567' })?.assetId).toBe(
      '0123456789abcdef01234567',
    );
  });

  it('bỏ binding sai dạng', () => {
    const el = parseElement({
      ...base,
      type: 'arrow',
      startBinding: { elementId: 5 },
      endBinding: { elementId: 'b' },
    });
    expect(el?.startBinding).toBeUndefined();
    expect(el?.endBinding).toEqual({ elementId: 'b' });
  });
});

describe('applyPatch', () => {
  it('trả bản sao, khoá undefined xoá trường', () => {
    const arrow = make('arrow', 'a', { startBinding: { elementId: 'r' } });
    const next = applyPatch(arrow, { x: 9, startBinding: undefined });
    expect(next.x).toBe(9);
    expect('startBinding' in next).toBe(false);
    expect(arrow.x).toBe(0);
    expect(arrow.startBinding).toEqual({ elementId: 'r' });
  });
});
