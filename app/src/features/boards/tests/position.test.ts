import { applyMoveResult, applyOptimisticMove } from '../utils/optimistic-move';
import { tempKeyBetween } from '../utils/position';
import { comparePosition, sortByPosition } from '../utils/task-order';
import { ids, makeData, makeTask } from './fixtures';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));

/** Khoá không kết thúc bằng "0" (giới hạn của bản thay thế). */
function dataWithKeys() {
  const data = makeData();
  const keys = ['a1', 'a2', 'a3'];
  data.columns.c_todo = (data.columns.c_todo ?? []).map((task, index) => ({ ...task, position: keys[index] ?? 'a9' }));
  data.columns.c_doing = (data.columns.c_doing ?? []).map((task) => ({ ...task, position: 'a1' }));
  return data;
}

describe('tempKeyBetween (khoá tạm)', () => {
  it('nằm giữa hai hàng xóm', () => {
    const key = tempKeyBetween('a1', 'a2');
    expect(key > 'a1' && key < 'a2').toBe(true);
  });

  it('đầu cột và cuối cột', () => {
    expect(tempKeyBetween(null, 'a1') < 'a1').toBe(true);
    expect(tempKeyBetween('a3', null) > 'a3').toBe(true);
  });

  it('cột rỗng ⇒ có khoá', () => {
    expect(tempKeyBetween(null, null)).toEqual(expect.any(String));
  });

  it('cache lệch thứ tự (a ≥ b) KHÔNG ném lỗi — lùi về khoá sau `a`', () => {
    expect(() => tempKeyBetween('a3', 'a1')).not.toThrow();
    expect(tempKeyBetween('a3', 'a1') > 'a3').toBe(true);
  });

  it('chèn liên tiếp vào cùng khe vẫn ra thứ tự đúng (khoá dài dần nhưng không trùng)', () => {
    let upper = 'a2';
    const seen = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      const key = tempKeyBetween('a1', upper);
      expect(key > 'a1' && key < upper).toBe(true);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      upper = key;
    }
  });
});

describe('comparePosition / sortByPosition', () => {
  it('so sánh chuỗi thô: chữ hoa đứng TRƯỚC chữ thường (localeCompare sẽ sai)', () => {
    const sorted = sortByPosition([
      makeTask({ id: 'x', position: 'a1' }),
      makeTask({ id: 'y', position: 'B1' }),
    ]);
    expect(sorted.map((task) => task.id)).toEqual(['y', 'x']);
  });

  it('trùng position ⇒ theo id (ổn định)', () => {
    const a = makeTask({ id: 'a', position: 'a1' });
    const b = makeTask({ id: 'b', position: 'a1' });
    expect(comparePosition(a, b)).toBe(-1);
    expect(comparePosition(b, a)).toBe(1);
    expect(comparePosition(a, a)).toBe(0);
  });
});

describe('applyOptimisticMove / applyMoveResult', () => {
  it('đặt thẻ vào giữa hai hàng xóm ở cột đích với khoá tạm, KHÔNG đổi version', () => {
    const data = dataWithKeys();
    const next = applyOptimisticMove(data, {
      afterTaskId: 't1',
      beforeTaskId: 't2',
      columnId: 'c_todo',
      columnKind: 'TODO',
      taskId: 't3',
    });
    expect(ids(next, 'c_todo')).toEqual(['t1', 't3', 't2']);
    expect(next.columns.c_todo?.find((task) => task.id === 't3')?.version).toBe(1);
  });

  it('sang cột khác: gỡ khỏi cột cũ, cập nhật columnKind', () => {
    const next = applyOptimisticMove(dataWithKeys(), {
      afterTaskId: 'd1',
      beforeTaskId: null,
      columnId: 'c_doing',
      columnKind: 'IN_PROGRESS',
      taskId: 't1',
    });
    expect(ids(next, 'c_doing')).toEqual(['d1', 't1']);
    expect(ids(next, 'c_todo')).toEqual(['t2', 't3']);
    expect(next.columns.c_doing?.at(-1)?.columnKind).toBe('IN_PROGRESS');
  });

  it('thẻ không có trong cache ⇒ trả lại nguyên cache', () => {
    const data = dataWithKeys();
    expect(
      applyOptimisticMove(data, { afterTaskId: null, beforeTaskId: null, columnId: 'c_todo', columnKind: 'TODO', taskId: 'lạ' }),
    ).toBe(data);
  });

  it('applyMoveResult ghi position/version/completedAt THẬT rồi sắp lại', () => {
    const data = applyOptimisticMove(dataWithKeys(), {
      afterTaskId: 't3',
      beforeTaskId: null,
      columnId: 'c_todo',
      columnKind: 'TODO',
      taskId: 't1',
    });
    const done = applyMoveResult(data, {
      columnId: 'c_done',
      columnKind: 'DONE',
      completedAt: '2026-09-19T00:00:00.000Z',
      id: 't1',
      position: 'a5',
      version: 2,
    });
    expect(ids(done, 'c_done')).toEqual(['t1']);
    expect(done.columns.c_done?.[0]).toMatchObject({ completedAt: '2026-09-19T00:00:00.000Z', position: 'a5', version: 2 });
  });
});
