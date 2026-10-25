import type { GanttTaskDto } from '../api/critical-path.types';
import type { TaskActivityDto } from '../api/task-detail.types';
import { activitySentence } from '../utils/activity-text';
import { buildPredecessorMap, ganttStatuses } from '../utils/gantt-status';

function task(overrides: Partial<GanttTaskDto> & Pick<GanttTaskDto, 'id'>): GanttTaskDto {
  return {
    assigneeIds: [],
    blockedByCount: 0,
    columnKind: 'TODO',
    conflict: false,
    dueDate: null,
    isCritical: false,
    slackDays: null,
    startDate: null,
    title: `Thẻ ${overrides.id}`,
    ...overrides,
  };
}

describe('ganttStatuses — chữ + icon, không chỉ màu', () => {
  const a = task({ columnKind: 'IN_PROGRESS', id: 'a', title: 'Viết báo cáo' });
  const b = task({ blockedByCount: 1, id: 'b' });
  const context = {
    predecessors: buildPredecessorMap([{ predecessorId: 'a', slackDays: 0, successorId: 'b' }]),
    tasksById: new Map([
      ['a', a],
      ['b', b],
    ]),
  };

  it('bị chặn bởi thẻ chưa xong: nêu TÊN thẻ đó', () => {
    expect(ganttStatuses(b, context)).toEqual([{ kind: 'blocked', label: 'Bị chặn bởi Viết báo cáo (chưa xong)' }]);
  });

  it('thẻ trước đã xong hoặc ngoài khoảng ngày: rơi về số thẻ chưa xong', () => {
    const done = { ...context, tasksById: new Map([['a', { ...a, columnKind: 'DONE' as const }], ['b', b]]) };
    expect(ganttStatuses(b, done)[0]?.label).toBe('Bị chặn bởi 1 thẻ chưa xong');
  });

  it('xung đột + đường găng đứng TRƯỚC; thẻ đã xong không "bị chặn"', () => {
    const risky = task({ blockedByCount: 2, conflict: true, id: 'r', isCritical: true });
    expect(ganttStatuses(risky, context).map((status) => status.label)).toEqual([
      'Xung đột lịch',
      'Đường găng',
      'Bị chặn bởi 2 thẻ chưa xong',
    ]);
    expect(ganttStatuses(task({ blockedByCount: 1, columnKind: 'DONE', id: 'd' }), context)).toEqual([
      { kind: 'done', label: 'Hoàn thành' },
    ]);
  });

  it('nhiều thẻ trước chưa xong: "và N thẻ khác"', () => {
    const c = task({ id: 'c', title: 'Thiết kế' });
    const multi = {
      predecessors: buildPredecessorMap([
        { predecessorId: 'a', slackDays: 0, successorId: 'b' },
        { predecessorId: 'c', slackDays: 1, successorId: 'b' },
      ]),
      tasksById: new Map([['a', a], ['b', { ...b, blockedByCount: 2 }], ['c', c]]),
    };
    expect(ganttStatuses({ ...b, blockedByCount: 2 }, multi)[0]?.label).toBe(
      'Bị chặn bởi Viết báo cáo (chưa xong) và 1 thẻ khác',
    );
  });
});

describe('activity phụ thuộc / dời lịch', () => {
  const titles: Record<string, string> = { p1: 'Thiết kế', s1: 'Lập trình' };
  const resolve = (id: string) => titles[id];
  const make = (overrides: Partial<TaskActivityDto>): TaskActivityDto => ({
    actor: { avatarUrl: null, id: 'u1', name: 'Minh' },
    after: null,
    at: '2026-09-25T00:00:00.000Z',
    before: null,
    id: 'act1',
    taskId: 't1',
    type: 'DEPENDENCY_ADDED',
    ...overrides,
  });

  it('DEPENDENCY_ADDED ở thẻ SAU ({ predecessorId }): "thẻ này chờ thẻ X xong"', () => {
    expect(activitySentence(make({ after: { predecessorId: 'p1' } }), undefined, undefined, resolve)).toBe(
      'Minh đã thêm phụ thuộc: thẻ này chờ thẻ "Thiết kế" xong',
    );
  });

  it('DEPENDENCY_ADDED ở thẻ TRƯỚC ({ successorId }): "thẻ Y chờ thẻ này xong"', () => {
    expect(activitySentence(make({ after: { successorId: 's1' } }), undefined, undefined, resolve)).toBe(
      'Minh đã thêm phụ thuộc: thẻ "Lập trình" chờ thẻ này xong',
    );
  });

  it('DEPENDENCY_REMOVED đọc ở `before`; thẻ không tra được → "một thẻ khác"', () => {
    const removed = make({ before: { predecessorId: 'lạ' }, type: 'DEPENDENCY_REMOVED' });
    expect(activitySentence(removed, undefined, undefined, resolve)).toBe(
      'Minh đã gỡ phụ thuộc: thẻ này không còn chờ thẻ một thẻ khác',
    );
    expect(activitySentence(make({ type: 'DEPENDENCY_REMOVED' }))).toBe('Minh đã gỡ phụ thuộc');
  });

  it('RESCHEDULED ghi rõ "do thẻ A đổi hạn"; thiếu nguồn thì "theo phụ thuộc"', () => {
    const rescheduled = make({
      after: { dueDate: '2026-09-28T05:00:00.000Z', sourceTaskId: 'p1' },
      type: 'RESCHEDULED',
    });
    expect(activitySentence(rescheduled, undefined, undefined, resolve)).toMatch(
      /^Minh đã dời hạn chót sang \d{2}\/09\/2026 do thẻ "Thiết kế" đổi hạn$/,
    );
    expect(activitySentence(make({ type: 'RESCHEDULED' }))).toBe('Minh đã dời lịch thẻ theo phụ thuộc');
  });
});
