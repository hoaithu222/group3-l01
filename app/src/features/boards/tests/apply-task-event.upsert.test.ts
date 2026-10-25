import { applyTaskEvent } from '../utils/apply-task-event';
import { ids, makeData, makeTask } from './fixtures';

const CTX = { currentUserId: 'me', filter: {} };

describe('applyTaskEvent — task:created / task:updated / task:deleted', () => {
  it('created: chèn thẻ mới đúng thứ tự position trong cột của nó', () => {
    const task = makeTask({ id: 'n1', position: 'a1V' });
    const { data } = applyTaskEvent(makeData(), { task, type: 'created' }, CTX);
    expect(ids(data, 'c_todo')).toEqual(['t1', 't2', 'n1', 't3']);
  });

  it('created trùng (đã có id) ⇒ không nhân đôi', () => {
    const data = makeData();
    const again = makeTask({ id: 't2', position: 'a1' });
    const result = applyTaskEvent(data, { task: again, type: 'created' }, CTX);
    expect(result.data).toBe(data);
    expect(ids(result.data, 'c_todo')).toEqual(['t1', 't2', 't3']);
  });

  it('created tới SAU thẻ tạm của chính mình: id thật khác id tạm nên cả hai tồn tại — hook gỡ thẻ tạm ở onSuccess', () => {
    const data = makeData();
    data.columns.c_todo = [...(data.columns.c_todo ?? []), makeTask({ id: 'tmp_k1', position: 'a3', version: 0 })];
    const { data: next } = applyTaskEvent(
      data,
      { task: makeTask({ id: 'real1', position: 'a3' }), type: 'created' },
      CTX,
    );
    expect(ids(next, 'c_todo')).toContain('real1');
  });

  it('created không khớp bộ lọc ⇒ bỏ qua', () => {
    const data = makeData();
    const task = makeTask({ id: 'n1', labelIds: ['khác'], position: 'a9' });
    const result = applyTaskEvent(data, { task, type: 'created' }, { ...CTX, filter: { labelId: 'l1' } });
    expect(result.data).toBe(data);
  });

  it('created khớp bộ lọc "Của tôi" ⇒ chèn', () => {
    const task = makeTask({
      assignees: [{ avatarUrl: null, id: 'me', name: 'Tôi' }],
      id: 'n1',
      position: 'a9',
    });
    const { data } = applyTaskEvent(makeData(), { task, type: 'created' }, { ...CTX, filter: { assigneeId: 'me' } });
    expect(ids(data, 'c_todo')).toContain('n1');
  });

  it('updated: thay thẻ khi version mới hơn, đổi cột nếu columnId đổi', () => {
    const task = makeTask({ columnId: 'c_doing', columnKind: 'IN_PROGRESS', id: 't1', position: 'a5', title: 'Đã sửa', version: 2 });
    const { data } = applyTaskEvent(makeData(), { task, type: 'updated' }, CTX);
    expect(ids(data, 'c_todo')).toEqual(['t2', 't3']);
    expect(data.columns.c_doing?.map((item) => item.title)).toEqual(['Thẻ d1', 'Đã sửa']);
  });

  it('updated cũ hơn hoặc bằng ⇒ bỏ', () => {
    const data = makeData();
    const stale = makeTask({ id: 't1', title: 'Cũ', version: 1 });
    expect(applyTaskEvent(data, { task: stale, type: 'updated' }, CTX).data).toBe(data);
  });

  it('updated làm thẻ không còn khớp bộ lọc ⇒ gỡ khỏi cache', () => {
    const data = makeData();
    data.columns.c_todo = [makeTask({ id: 't1', labelIds: ['l1'], position: 'a0' })];
    const task = makeTask({ id: 't1', labelIds: [], position: 'a0', version: 2 });
    const { data: next } = applyTaskEvent(data, { task, type: 'updated' }, { ...CTX, filter: { labelId: 'l1' } });
    expect(ids(next, 'c_todo')).toEqual([]);
  });

  it('updated cho thẻ chưa có nhưng khớp bộ lọc ⇒ chèn (vd vừa được gắn nhãn đang lọc)', () => {
    const task = makeTask({ id: 'x', labelIds: ['l1'], position: 'a9' });
    const { data } = applyTaskEvent(makeData(), { task, type: 'updated' }, { ...CTX, filter: { labelId: 'l1' } });
    expect(ids(data, 'c_todo')).toContain('x');
  });

  it('deleted: gỡ thẻ; xoá hai lần vô hại', () => {
    const first = applyTaskEvent(makeData(), { id: 't2', type: 'deleted' }, CTX).data;
    expect(ids(first, 'c_todo')).toEqual(['t1', 't3']);
    expect(applyTaskEvent(first, { id: 't2', type: 'deleted' }, CTX).data).toBe(first);
  });

  it('tìm theo tiêu đề không phân biệt dấu khi lọc `q`', () => {
    const task = makeTask({ id: 'n1', position: 'a9', title: 'Thiết kế màn hình' });
    const { data } = applyTaskEvent(
      makeData(),
      { task, type: 'created' },
      { ...CTX, filter: { q: 'thiet ke' } },
    );
    expect(ids(data, 'c_todo')).toContain('n1');
  });
});
