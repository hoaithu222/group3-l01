import { mentorHref } from '@/core/notifications/mentor-route';
import type { InboxItem } from '@/core/notifications';

import { inboxItemTarget } from '../utils/inbox-target';

/**
 * p6-03: `mentor.*` mang id ở `refs` (bài/đơn/đợt/nhóm chat) — `inboxItemTarget` phải đưa chúng vào `NotificationTarget` để `mentorHref` chọn
 * đúng màn. Chưa nối vào `hrefForTarget` (`notification-route.ts` đang được phiên khác sửa) nên test đi thẳng tới `mentorHref`.
 */
function make(overrides: Partial<InboxItem>): InboxItem {
  return {
    actor: null,
    actorId: null,
    context: { available: true, muted: false },
    createdAt: '2026-09-25T10:00:00.000Z',
    id: 'n1',
    kind: 'DEFAULT',
    muted: false,
    readAt: null,
    refs: {},
    scopeId: null,
    scopeType: undefined,
    type: 'mentor.accepted',
    unavailable: false,
    workspaceId: 'ws-1',
    ...overrides,
  } as unknown as InboxItem;
}

describe('inboxItemTarget — mentor.*', () => {
  it('refs.postId/applicationId/engagementId/conversationId đi vào target', () => {
    const target = inboxItemTarget(
      make({
        refs: {
          applicationId: 'a1',
          conversationId: 'cv1',
          engagementId: 'e1',
          postId: 'p1',
          workspaceId: 'ws-1',
        } as never,
      }),
    );

    expect(target).toMatchObject({
      applicationId: 'a1',
      conversationId: 'cv1',
      engagementId: 'e1',
      postId: 'p1',
      workspaceId: 'ws-1',
    });
  });

  it('mentor.accepted có nhóm chat → mở nhóm chat', () => {
    const target = inboxItemTarget(
      make({ refs: { conversationId: 'cv1', workspaceId: 'ws-1' } as never }),
    );

    expect(mentorHref(target)).toBe('/messages/cv1');
  });

  it('mentor.application → màn duyệt đơn của bài (refs.postId)', () => {
    const target = inboxItemTarget(
      make({
        refs: { applicationId: 'a1', postId: 'p1', workspaceId: 'ws-1' } as never,
        scopeType: 'WORKSPACE',
        type: 'mentor.application',
      }),
    );

    expect(mentorHref(target)).toBe('/workspaces/ws-1/mentor/p1/applications');
  });

  it('mentor.ended phía NHÓM (scopeType WORKSPACE) → quản lý cố vấn; phía cố vấn (không phạm vi) → tab Đang cố vấn', () => {
    const team = inboxItemTarget(
      make({ refs: { engagementId: 'e1' } as never, scopeType: 'WORKSPACE', type: 'mentor.ended' }),
    );
    const mentor = inboxItemTarget(
      make({ refs: { engagementId: 'e1' } as never, scopeType: undefined, type: 'mentor.ended' }),
    );

    expect(mentorHref(team)).toBe('/workspaces/ws-1/mentor');
    expect(mentorHref(mentor)).toBe('/mentor?tab=engaged');
  });

  it('refs thiếu/không phải chuỗi → trường bỏ trống, không ném', () => {
    const target = inboxItemTarget(make({ refs: { postId: 123, conversationId: '' } as never }));

    expect(target.postId).toBeUndefined();
    expect(target.conversationId).toBeUndefined();
  });
});
