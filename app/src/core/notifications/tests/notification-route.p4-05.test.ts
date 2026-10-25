import { hrefForTarget, hrefOrActivity } from '../notification-route';
import { parsePushPayload } from '../push-payload.types';
import { decidePushTap } from '../push-router';

/**
 * p4-05 (chấm chéo): loại `review.*` của BE (`be/src/modules/projects/services/review/review-notification.types.ts`) — push `dataKeys` =
 * `taskId`, `boardId`, `workspaceId`, `roundId`; hộp thư mang cùng các id ở `refs`. Người chấm (`requested`/`reminder`) mở THẲNG màn chấm;
 * OWNER/ADMIN (`shortage`) mở cài đặt chấm chéo; người làm thẻ (`changes-requested`/`approved`/`waived`) và `cancelled` mở chi tiết thẻ.
 */
const TARGET = { boardId: 'b-1', taskId: 't-1', workspaceId: 'ws-1' };
const TASK_DETAIL = {
  params: { boardId: 'b-1', taskId: 't-1', wsId: 'ws-1' },
  pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
};

describe('hrefForTarget — chấm chéo (p4-05)', () => {
  it.each(['review.requested', 'review.reminder'])('%s → màn chấm của thẻ', (type) => {
    expect(hrefForTarget({ ...TARGET, type })).toBe('/workspaces/ws-1/boards/b-1/tasks/t-1/review');
  });

  it('review.shortage → cài đặt chấm chéo của bảng', () => {
    expect(hrefForTarget({ ...TARGET, type: 'review.shortage' })).toBe('/workspaces/ws-1/boards/b-1/review-settings');
  });

  it.each(['review.changes-requested', 'review.approved', 'review.waived', 'review.cancelled'])(
    '%s → chi tiết thẻ (khối Chấm chéo)',
    (type) => {
      expect(hrefForTarget({ ...TARGET, type })).toEqual(TASK_DETAIL);
    },
  );

  it('thiếu boardId: người chấm vẫn tới được thẻ qua route giải boardId; thiếu mọi id → hộp thư', () => {
    expect(hrefForTarget({ taskId: 't-1', type: 'review.requested', workspaceId: 'ws-1' })).toEqual({
      params: { taskId: 't-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/tasks/[taskId]',
    });
    expect(hrefForTarget({ type: 'review.shortage' })).toBeNull();
    expect(hrefOrActivity({ type: 'review.approved' })).toBe('/activity');
  });
});

describe('push — chấm chéo (p4-05)', () => {
  const data = (type: string) => ({
    ...TARGET,
    roundId: 'r-1',
    sentAt: '2026-09-25T07:00:00.000Z',
    targetUserId: 'user-me',
    type,
  });

  it('chạm push "Bạn được giao chấm" → mở thẳng màn chấm', () => {
    const payload = parsePushPayload(data('review.requested'));

    expect(decidePushTap(payload, { authenticated: true, userId: 'user-me' })).toEqual({
      href: '/workspaces/ws-1/boards/b-1/tasks/t-1/review',
      kind: 'navigate',
    });
  });

  it('push của người khác trên cùng máy bị bỏ — không mở màn chấm của họ', () => {
    const payload = parsePushPayload(data('review.reminder'));

    expect(decidePushTap(payload, { authenticated: true, userId: 'someone-else' })).toEqual({ kind: 'ignored', reason: 'other-user' });
  });
});
