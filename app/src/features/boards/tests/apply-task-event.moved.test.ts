import type { MoveTaskResult, TaskEvent } from '../api/boards.types';
import { applyTaskEvent } from '../utils/apply-task-event';
import { ids, makeData, makeTask } from './fixtures';

const CTX = { currentUserId: 'me', filter: {}, now: Date.parse('2026-09-19T00:00:00.000Z') };

function moved(patch: Partial<MoveTaskResult> & Pick<MoveTaskResult, 'id'>): TaskEvent {
  return {
    patch: {
      columnId: 'c_todo',
      columnKind: 'TODO',
      completedAt: null,
      position: 'a0',
      version: 2,
      ...patch,
    },
    type: 'moved',
  };
}

describe('applyTaskEvent — task:moved', () => {
  it('chuyển thẻ sang cột khác và chèn đúng thứ tự position', () => {
    const data = makeData();
    // "d1" vào cột Cần làm, giữa t1 (a0) và t2 (a1).
    const { data: next, stale } = applyTaskEvent(
      data,
      moved({ columnId: 'c_todo', columnKind: 'TODO', id: 'd1', position: 'a0V' }),
      CTX,
    );
    expect(ids(next, 'c_todo')).toEqual(['t1', 'd1', 't2', 't3']);
    expect(ids(next, 'c_doing')).toEqual([]);
    expect(stale).toBe(false);
  });

  it('sắp lại trong CÙNG cột khi chỉ đổi position', () => {
    const { data } = applyTaskEvent(makeData(), moved({ id: 't3', position: 'Zz' }), CTX);
    expect(ids(data, 'c_todo')).toEqual(['t3', 't1', 't2']);
  });

  it('bỏ sự kiện CŨ hơn hoặc BẰNG version đang có', () => {
    const data = makeData();
    const same = applyTaskEvent(data, moved({ id: 't1', position: 'Zz', version: 1 }), CTX);
    expect(same.data).toBe(data);

    const older = applyTaskEvent(data, moved({ id: 't1', position: 'Zz', version: 0 }), CTX);
    expect(older.data).toBe(data);
  });

  it('sự kiện trùng: áp lần hai không đổi gì (version đã bằng)', () => {
    const event = moved({ columnId: 'c_done', columnKind: 'DONE', id: 't1', position: 'a0' });
    const first = applyTaskEvent(makeData(), event, CTX).data;
    const second = applyTaskEvent(first, event, CTX);
    expect(second.data).toBe(first);
    expect(ids(first, 'c_done')).toEqual(['t1']);
  });

  it('hai sự kiện tới sai thứ tự: chỉ bản version cao nhất thắng', () => {
    const v3 = moved({ columnId: 'c_done', columnKind: 'DONE', id: 't1', position: 'a0', version: 3 });
    const v2 = moved({ columnId: 'c_doing', columnKind: 'IN_PROGRESS', id: 't1', position: 'a5', version: 2 });
    const afterV3 = applyTaskEvent(makeData(), v3, CTX).data;
    const afterV2 = applyTaskEvent(afterV3, v2, CTX).data;
    expect(ids(afterV2, 'c_done')).toEqual(['t1']);
    expect(ids(afterV2, 'c_doing')).toEqual(['d1']);
  });

  it('vào cột DONE: ghi completedAt/version và bỏ cờ quá hạn', () => {
    const data = makeData();
    data.columns.c_todo = [
      makeTask({ dueDate: '2026-09-01T00:00:00.000Z', id: 't1', isOverdue: true, position: 'a0' }),
    ];
    const { data: next } = applyTaskEvent(
      data,
      moved({
        columnId: 'c_done',
        columnKind: 'DONE',
        completedAt: '2026-09-19T00:00:00.000Z',
        id: 't1',
      }),
      CTX,
    );
    const task = next.columns.c_done?.[0];
    expect(task).toMatchObject({ completedAt: '2026-09-19T00:00:00.000Z', isOverdue: false, version: 2 });
  });

  it('rời DONE: tính lại quá hạn theo hạn chót', () => {
    const data = makeData();
    data.columns.c_done = [
      makeTask({
        columnId: 'c_done',
        columnKind: 'DONE',
        dueDate: '2026-09-01T00:00:00.000Z',
        id: 'x1',
        position: 'a0',
      }),
    ];
    const { data: next } = applyTaskEvent(data, moved({ columnId: 'c_todo', id: 'x1', position: 'a3' }), CTX);
    expect(next.columns.c_todo?.at(-1)).toMatchObject({ id: 'x1', isOverdue: true });
  });

  it('thẻ chưa có trong cache không lọc ⇒ stale (cần tải lại), KHÔNG bịa thẻ', () => {
    const data = makeData();
    const result = applyTaskEvent(data, moved({ id: 'lạ' }), CTX);
    expect(result.data).toBe(data);
    expect(result.stale).toBe(true);
  });

  it('thẻ chưa có trong cache ĐANG LỌC ⇒ bỏ qua (thẻ có thể đã bị lọc ra)', () => {
    const data = makeData();
    const result = applyTaskEvent(data, moved({ id: 'lạ' }), { ...CTX, filter: { labelId: 'l1' } });
    expect(result).toEqual({ data, stale: false });
  });

  it('cache lọc "quá hạn": thẻ vào DONE không còn khớp ⇒ bị gỡ khỏi cache', () => {
    const data = makeData();
    data.columns.c_todo = [makeTask({ id: 't1', isOverdue: true, position: 'a0' })];
    const { data: next } = applyTaskEvent(
      data,
      moved({ columnId: 'c_done', columnKind: 'DONE', id: 't1' }),
      { ...CTX, filter: { overdue: true } },
    );
    expect(ids(next, 'c_todo')).toEqual([]);
    expect(ids(next, 'c_done')).toEqual([]);
  });
});
