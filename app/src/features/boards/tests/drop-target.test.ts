import {
  findColumnAt,
  resolveDropTarget,
  slotIndexAt,
  type CardBox,
  type ColumnBox,
} from '../components/kanban/drag/drop-target';

/** Ba thẻ cao 80, cách đều: top 0 / 80 / 160 (toạ độ NỘI DUNG list). */
const CARDS: CardBox[] = [
  { height: 80, id: 'a', top: 0 },
  { height: 80, id: 'b', top: 80 },
  { height: 80, id: 'c', top: 160 },
];

function column(overrides: Partial<ColumnBox> & Pick<ColumnBox, 'columnId'>): ColumnBox {
  return { cards: CARDS, height: 600, left: 0, scrollY: 0, top: 100, width: 300, ...overrides };
}

describe('slotIndexAt — khe chèn theo chiều dọc', () => {
  it('trên tâm thẻ đầu ⇒ khe 0 (đầu cột)', () => {
    expect(slotIndexAt(10, CARDS, 'zz')).toBe(0);
  });

  it('giữa hai thẻ ⇒ khe giữa (sau tâm thẻ trên, trước tâm thẻ dưới)', () => {
    expect(slotIndexAt(100, CARDS, 'zz')).toBe(1);
    expect(slotIndexAt(190, CARDS, 'zz')).toBe(2);
  });

  it('dưới tâm thẻ cuối ⇒ khe cuối (cuối cột)', () => {
    expect(slotIndexAt(1000, CARDS, 'zz')).toBe(3);
  });

  it('bỏ thẻ đang kéo khỏi phép đếm', () => {
    // Kéo "b": còn a, c ⇒ thả ngay dưới a chỉ là khe 1, thả dưới c là khe 2.
    expect(slotIndexAt(100, CARDS, 'b')).toBe(1);
    expect(slotIndexAt(1000, CARDS, 'b')).toBe(2);
  });

  it('cột rỗng ⇒ khe 0', () => {
    expect(slotIndexAt(50, [], 'x')).toBe(0);
  });
});

describe('findColumnAt', () => {
  const columns = [column({ columnId: 'c1', left: 0 }), column({ columnId: 'c2', left: 312 })];

  it('chọn cột chứa x', () => {
    expect(findColumnAt(50, columns)?.columnId).toBe('c1');
    expect(findColumnAt(400, columns)?.columnId).toBe('c2');
  });

  it('x rơi vào khe hở/ngoài mép ⇒ cột có tâm gần nhất', () => {
    expect(findColumnAt(305, columns)?.columnId).toBe('c1');
    expect(findColumnAt(310, columns)?.columnId).toBe('c2');
    expect(findColumnAt(-500, columns)?.columnId).toBe('c1');
    expect(findColumnAt(5000, columns)?.columnId).toBe('c2');
  });

  it('không có cột ⇒ null', () => {
    expect(findColumnAt(10, [])).toBeNull();
  });
});

describe('resolveDropTarget — after/before đúng ở đầu/giữa/cuối cột', () => {
  const columns = [column({ columnId: 'c1' })];

  it('đầu cột: after=null, before=thẻ đầu', () => {
    // y cửa sổ 105 ⇒ nội dung 5 (< tâm thẻ a = 40).
    expect(resolveDropTarget({ x: 10, y: 105 }, columns, 'zz')).toEqual({
      afterTaskId: null,
      beforeTaskId: 'a',
      columnId: 'c1',
      index: 0,
    });
  });

  it('giữa cột: after và before là hai thẻ kề', () => {
    // cột.top = 100 ⇒ y cửa sổ 280 ứng với nội dung 180 ⇒ nằm giữa tâm b (120) và tâm c (200).
    expect(resolveDropTarget({ x: 10, y: 280 }, columns, 'zz')).toEqual({
      afterTaskId: 'b',
      beforeTaskId: 'c',
      columnId: 'c1',
      index: 2,
    });
  });

  it('cuối cột: before=null', () => {
    expect(resolveDropTarget({ x: 10, y: 900 }, columns, 'zz')).toEqual({
      afterTaskId: 'c',
      beforeTaskId: null,
      columnId: 'c1',
      index: 3,
    });
  });

  it('tính theo độ cuộn của list', () => {
    // Cuộn 160 ⇒ ngón tay ở y cửa sổ 105 ứng với nội dung 165 (giữa b và c).
    const scrolled = [column({ columnId: 'c1', scrollY: 160 })];
    expect(resolveDropTarget({ x: 10, y: 105 }, scrolled, 'zz')?.afterTaskId).toBe('b');
  });

  it('kéo thẻ khỏi chính cột của nó: hàng xóm không bao giờ là chính nó', () => {
    const target = resolveDropTarget({ x: 10, y: 900 }, columns, 'c');
    expect(target).toMatchObject({ afterTaskId: 'b', beforeTaskId: null, index: 2 });
  });

  it('cột rỗng: after=before=null', () => {
    const empty = [column({ cards: [], columnId: 'c9' })];
    expect(resolveDropTarget({ x: 10, y: 300 }, empty, 'x')).toEqual({
      afterTaskId: null,
      beforeTaskId: null,
      columnId: 'c9',
      index: 0,
    });
  });

  it('không có cột nào ⇒ null', () => {
    expect(resolveDropTarget({ x: 0, y: 0 }, [], 'x')).toBeNull();
  });
});
