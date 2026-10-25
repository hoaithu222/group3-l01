import type { InboxItem } from '@/core/notifications';

import { activityIconFor } from '../utils/activity-icon';
import { describeActivity } from '../utils/describe-item';

/**
 * BE chỉ điền `actor` cho mục thuộc TIN NHẮN; thẻ/gọi/nhóm/họp/ví… không có. Trước đây câu của thẻ/cuộc gọi rơi về "Ai đó giao cho bạn
 * một thẻ" và ảnh đại diện hiện "?" — nay có câu không người và biểu tượng theo LOẠI.
 */
function make(type: string): InboxItem {
  return {
    actor: null,
    actorId: null,
    context: { available: true, muted: false },
    createdAt: '2026-09-26T08:00:00.000Z',
    id: 'n1',
    kind: 'DEFAULT',
    muted: false,
    readAt: null,
    refs: { workspaceId: 'ws-1' },
    scopeId: null,
    scopeType: 'NONE',
    type,
    unavailable: false,
    workspaceId: 'ws-1',
  };
}

describe('mục không có người thực hiện — câu không dùng "Ai đó"', () => {
  it.each([
    ['task.assigned', 'Bạn được giao một thẻ'],
    ['task.comment', 'Có bình luận mới trên thẻ của bạn'],
    ['task.comment-mention', 'Bạn được nhắc đến trong một bình luận'],
    ['task.rescheduled', 'Một thẻ của bạn đã được dời lịch'],
    ['call.missed', 'Bạn có một cuộc gọi nhỡ'],
  ])('%s', (type, expected) => {
    expect(describeActivity(make(type)).title).toBe(expected);
  });

  it('có tên người thực hiện thì vẫn nêu tên', () => {
    const item = {
      ...make('task.assigned'),
      actor: { avatarUrl: null, name: 'Minh', userId: 'u1' },
    };
    expect(describeActivity(item).title).toBe('Minh giao cho bạn một thẻ');
  });
});

describe('activityIconFor', () => {
  it('nhóm/quyền/họp/ví có biểu tượng riêng theo loại; loại lạ rơi về chuông', () => {
    expect(activityIconFor('workspace.member-added')).toBe('add-team');
    expect(activityIconFor('workspace.admin-change')).toBe('shield-user');
    expect(activityIconFor('meeting.started')).toBe('calendar');
    expect(activityIconFor('wallet.expense-added')).toBe('wallet-add');
    expect(activityIconFor('gi.do.moi')).toBe('notification');
  });
});
