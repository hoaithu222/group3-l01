import { hrefForTarget, hrefOrActivity } from '../notification-route';
import { resolvePushHref } from '../push-router';

/**
 * p4-04 (app.md §1): `task.rescheduled` mở THẺ NGUỒN qua đường thẻ sẵn có (p3-03); `task.reschedule-batch-done` mở BẢNG.
 * Tên loại theo quy ước chữ thường-dấu chấm của BE (`registerNotificationType`), KHÔNG phải khoá kế hoạch
 * (`TASK_RESCHEDULED`…) — xem `be/src/core/constants/notification-types.ts`.
 */
describe('hrefForTarget — thông báo dời lịch (p4-04)', () => {
  it('task.rescheduled có boardId + taskId (thẻ nguồn) → thẳng chi tiết thẻ', () => {
    expect(
      hrefForTarget({ boardId: 'b1', taskId: 'src', type: 'task.rescheduled', workspaceId: 'ws' }),
    ).toEqual({
      params: { boardId: 'b1', taskId: 'src', wsId: 'ws' },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    });
  });

  it('task.rescheduled thiếu boardId → route giải boardId của deep link p3-03', () => {
    expect(hrefForTarget({ taskId: 'src', type: 'task.rescheduled', workspaceId: 'ws' })).toEqual({
      params: { taskId: 'src', wsId: 'ws' },
      pathname: '/workspaces/[wsId]/tasks/[taskId]',
    });
  });

  it('task.reschedule-batch-done mở BẢNG (không có thẻ đích duy nhất)', () => {
    expect(
      hrefForTarget({ boardId: 'b1', type: 'task.reschedule-batch-done', workspaceId: 'ws' }),
    ).toEqual({
      params: { boardId: 'b1', wsId: 'ws' },
      pathname: '/workspaces/[wsId]/boards/[boardId]',
    });
  });

  it('lô nền có cả taskId thì vẫn mở BẢNG chứ không mở thẻ', () => {
    expect(
      hrefForTarget({ boardId: 'b1', taskId: 'x', type: 'task.reschedule-batch-done', workspaceId: 'ws' }),
    ).toMatchObject({ pathname: '/workspaces/[wsId]/boards/[boardId]' });
  });

  it('lô nền thiếu boardId hoặc workspaceId → null (rơi về hộp thư /activity), không dựng đường dẫn thiếu tham số', () => {
    expect(hrefForTarget({ type: 'task.reschedule-batch-done', workspaceId: 'ws' })).toBeNull();
    expect(hrefForTarget({ boardId: 'b1', type: 'task.reschedule-batch-done' })).toBeNull();
    expect(hrefOrActivity({ type: 'task.reschedule-batch-done' })).toBe('/activity');
  });

  it('push chạm vào lô nền → bảng (dữ liệu push mang boardId/workspaceId)', () => {
    expect(
      resolvePushHref({
        boardId: 'b1',
        targetUserId: 'u1',
        type: 'task.reschedule-batch-done',
        workspaceId: 'ws',
      }),
    ).toEqual({ params: { boardId: 'b1', wsId: 'ws' }, pathname: '/workspaces/[wsId]/boards/[boardId]' });
  });

  it('loại `task.*` cũ không bị ảnh hưởng (task.assigned vẫn vào thẻ)', () => {
    expect(hrefForTarget({ boardId: 'b1', taskId: 't1', type: 'task.assigned', workspaceId: 'ws' })).toEqual({
      params: { boardId: 'b1', taskId: 't1', wsId: 'ws' },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    });
  });
});
