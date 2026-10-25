import type { InboxItem } from '@/core/notifications';

import { describeActivity } from '../utils/describe-item';
import { inboxItemTarget } from '../utils/inbox-target';

function make(overrides: Partial<InboxItem>): InboxItem {
  return {
    actor: { avatarUrl: null, name: 'Minh', userId: 'u1' },
    actorId: 'u1',
    context: { available: true, muted: false },
    createdAt: '2026-09-25T10:00:00.000Z',
    id: 'n1',
    kind: 'TASK_RESCHEDULED',
    muted: false,
    readAt: null,
    refs: {},
    scopeId: 'b1',
    scopeType: 'WORKSPACE',
    type: 'task.rescheduled',
    unavailable: false,
    workspaceId: 'ws-1',
    ...overrides,
  };
}

describe('hộp thư — thông báo dời lịch (p4-04)', () => {
  it('task.rescheduled: câu mô tả + đích là THẺ NGUỒN (refs.sourceTaskId) kèm boardId', () => {
    const item = make({ refs: { boardId: 'b1', sourceTaskId: 'src', taskIds: ['t2', 't3'] } as never });

    expect(describeActivity(item).title).toBe('Minh đã dời lịch một thẻ của bạn');
    expect(inboxItemTarget(item)).toMatchObject({ boardId: 'b1', taskId: 'src', type: 'task.rescheduled', workspaceId: 'ws-1' });
  });

  it('refs.taskId (nếu BE dùng tên này) vẫn thắng sourceTaskId', () => {
    const item = make({ refs: { taskId: 'x', sourceTaskId: 'src' } as never });
    expect(inboxItemTarget(item).taskId).toBe('x');
  });

  it('task.reschedule-batch-done: câu mô tả riêng, mang kèm trích đoạn kết quả của BE', () => {
    const item = make({
      context: { available: true, excerpt: 'Đã dời 249 thẻ, 1 xung đột', muted: false },
      kind: 'TASK_RESCHEDULE_BATCH_DONE',
      refs: { boardId: 'b1', batchId: 'batch-1' } as never,
      type: 'task.reschedule-batch-done',
    });

    expect(describeActivity(item)).toEqual({
      excerpt: 'Đã dời 249 thẻ, 1 xung đột',
      title: 'Lịch các thẻ phía sau đã được dời xong',
    });
    expect(inboxItemTarget(item)).toMatchObject({ boardId: 'b1', type: 'task.reschedule-batch-done' });
  });
});
