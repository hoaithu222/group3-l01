import type { InboxItem } from '@/core/notifications';
import { hrefForTarget } from '@/core/notifications';

import { inboxItemTarget } from '../utils/inbox-target';

function make(overrides: Partial<InboxItem>): InboxItem {
  return {
    actor: { avatarUrl: null, name: 'Minh', userId: 'u1' },
    actorId: 'u1',
    context: { available: true, muted: false },
    createdAt: '2026-09-25T10:00:00.000Z',
    id: 'n1',
    kind: 'DEFAULT',
    muted: false,
    readAt: null,
    refs: {},
    scopeId: null,
    scopeType: 'WORKSPACE',
    type: 'meeting.invited',
    unavailable: false,
    workspaceId: 'ws-1',
    ...overrides,
  } as InboxItem;
}

/** Hộp thư → đích: `refs` của mục phải tới được `hrefForTarget` cho các loại có id riêng (họp p2-04, thi thử p4-02). */
describe('inboxItemTarget — id riêng của từng loại', () => {
  it('meeting.*: refs.meetingId → chi tiết cuộc họp', () => {
    const target = inboxItemTarget(
      make({ refs: { meetingId: 'm1', workspaceId: 'ws-1' } as never }),
    );

    expect(target.meetingId).toBe('m1');
    expect(hrefForTarget(target)).toEqual({
      params: { meetingId: 'm1' },
      pathname: '/meetings/[meetingId]',
    });
  });

  it('study.mock-auto-submitted: refs.attemptId → kết quả lượt thi đó', () => {
    const target = inboxItemTarget(
      make({ refs: { attemptId: 'a1', setId: 's1' } as never, type: 'study.mock-auto-submitted' }),
    );

    expect(hrefForTarget(target)).toEqual({
      params: { attemptId: 'a1' },
      pathname: '/study/results/[attemptId]',
    });
  });

  it('thiếu id → không dựng đích (nơi gọi hiện thông báo trung tính)', () => {
    expect(hrefForTarget(inboxItemTarget(make({ refs: {} })))).toBeNull();
  });
});
