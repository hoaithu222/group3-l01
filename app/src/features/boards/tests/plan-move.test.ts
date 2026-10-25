import { neighborsAt, shortcutSlot } from '../utils/move-neighbors';
import { planMove } from '../utils/plan-move';
import { COLUMNS, makeData } from './fixtures';

describe('neighborsAt', () => {
  const list = ['a', 'b', 'c'];

  it('khe 0 ⇒ đầu cột', () => {
    expect(neighborsAt(list, 'zz', 0)).toEqual({ afterTaskId: null, beforeTaskId: 'a' });
  });

  it('khe giữa và cuối', () => {
    expect(neighborsAt(list, 'zz', 2)).toEqual({ afterTaskId: 'b', beforeTaskId: 'c' });
    expect(neighborsAt(list, 'zz', 3)).toEqual({ afterTaskId: 'c', beforeTaskId: null });
  });

  it('khe ngoài phạm vi bị kẹp về hai đầu', () => {
    expect(neighborsAt(list, 'zz', -5)).toEqual({ afterTaskId: null, beforeTaskId: 'a' });
    expect(neighborsAt(list, 'zz', 99)).toEqual({ afterTaskId: 'c', beforeTaskId: null });
  });

  it('bỏ chính thẻ đang di chuyển trước khi đếm', () => {
    expect(neighborsAt(list, 'b', 1)).toEqual({ afterTaskId: 'a', beforeTaskId: 'c' });
  });

  it('cột rỗng', () => {
    expect(neighborsAt([], 'x', 0)).toEqual({ afterTaskId: null, beforeTaskId: null });
  });

  it('thẻ TẠM (`tmp_…`, chưa có id server) không bao giờ là mốc — BE chỉ nhận ObjectId, gửi id tạm là 400', () => {
    const withTemp = ['a', 'b', 'tmp_task-1', 'tmp_task-2'];
    // Thả ngay dưới thẻ tạm cuối ⇒ "sau thẻ thật cuối", cuối cột.
    expect(neighborsAt(withTemp, 'zz', 4)).toEqual({ afterTaskId: 'b', beforeTaskId: null });
    // Thả giữa b và thẻ tạm ⇒ không có mốc phía sau (thẻ tạm nằm cuối cột).
    expect(neighborsAt(withTemp, 'zz', 2)).toEqual({ afterTaskId: 'b', beforeTaskId: null });
    expect(neighborsAt(withTemp, 'a', 0)).toEqual({ afterTaskId: null, beforeTaskId: 'b' });
  });
});

describe('shortcutSlot', () => {
  const list = ['a', 'b', 'c'];

  it('đầu cột: không thể lên', () => {
    expect(shortcutSlot(list, 'a', 'top')).toBeNull();
    expect(shortcutSlot(list, 'a', 'up')).toBeNull();
    expect(shortcutSlot(list, 'a', 'down')).toBe(1);
    expect(shortcutSlot(list, 'a', 'bottom')).toBe(2);
  });

  it('cuối cột: không thể xuống', () => {
    expect(shortcutSlot(list, 'c', 'down')).toBeNull();
    expect(shortcutSlot(list, 'c', 'bottom')).toBeNull();
    expect(shortcutSlot(list, 'c', 'top')).toBe(0);
    expect(shortcutSlot(list, 'c', 'up')).toBe(1);
  });

  it('thẻ không có trong cột ⇒ null', () => {
    expect(shortcutSlot(list, 'zz', 'up')).toBeNull();
  });
});

describe('planMove', () => {
  const data = makeData();
  const t2 = data.columns.c_todo?.[1];
  if (!t2) throw new Error('fixture thiếu t2');

  it('"Xuống 1": t2 xuống sau t3 ⇒ after=t3, before=null', () => {
    const plan = planMove(t2, COLUMNS, data.columns, { kind: 'shortcut', shortcut: 'down' });
    expect(plan).toMatchObject({ afterTaskId: 't3', beforeTaskId: null, columnId: 'c_todo', columnKind: 'TODO' });
  });

  it('"Lên 1": t2 lên trước t1 ⇒ after=null, before=t1', () => {
    const plan = planMove(t2, COLUMNS, data.columns, { kind: 'shortcut', shortcut: 'up' });
    expect(plan).toMatchObject({ afterTaskId: null, beforeTaskId: 't1' });
  });

  it('"Lên đầu" thẻ đã ở đầu ⇒ null', () => {
    const t1 = data.columns.c_todo?.[0];
    expect(t1 && planMove(t1, COLUMNS, data.columns, { kind: 'shortcut', shortcut: 'top' })).toBeNull();
  });

  it('chuyển sang cột khác: đầu cột / cuối cột, lấy đúng columnKind đích', () => {
    const top = planMove(t2, COLUMNS, data.columns, { columnId: 'c_doing', edge: 'top', kind: 'column' });
    expect(top).toMatchObject({ afterTaskId: null, beforeTaskId: 'd1', columnId: 'c_doing', columnKind: 'IN_PROGRESS' });

    const bottom = planMove(t2, COLUMNS, data.columns, { columnId: 'c_doing', edge: 'bottom', kind: 'column' });
    expect(bottom).toMatchObject({ afterTaskId: 'd1', beforeTaskId: null });

    const intoDone = planMove(t2, COLUMNS, data.columns, { columnId: 'c_done', edge: 'bottom', kind: 'column' });
    expect(intoDone).toMatchObject({ afterTaskId: null, beforeTaskId: null, columnKind: 'DONE' });
  });

  it('cột kế bên (a11y): sang phải từ Cần làm ⇒ cuối cột Đang làm; hết cột ⇒ null', () => {
    expect(planMove(t2, COLUMNS, data.columns, { direction: 1, kind: 'adjacentColumn' })).toMatchObject({
      afterTaskId: 'd1',
      columnId: 'c_doing',
    });
    expect(planMove(t2, COLUMNS, data.columns, { direction: -1, kind: 'adjacentColumn' })).toBeNull();
  });

  it('cột đích không tồn tại ⇒ null', () => {
    expect(planMove(t2, COLUMNS, data.columns, { columnId: 'c_khong_co', edge: 'top', kind: 'column' })).toBeNull();
  });
});
