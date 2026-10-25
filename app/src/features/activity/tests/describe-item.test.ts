import type { InboxItem } from '@/core/notifications';

import { describeActivity, UNAVAILABLE_TITLE } from '../utils/describe-item';
import { inboxItemTarget, isInboxItemUnavailable } from '../utils/inbox-target';

function make(overrides: Partial<InboxItem>): InboxItem {
  return {
    actor: { avatarUrl: null, name: 'Minh', userId: 'u1' },
    actorId: 'u1',
    context: { available: true, excerpt: 'xem giúp mình nhé', muted: false, scopeName: 'frontend' },
    createdAt: '2026-09-21T10:00:00.000Z',
    id: 'n1',
    kind: 'MENTION',
    muted: false,
    readAt: null,
    refs: { messageId: 'm1' },
    scopeId: 'ch-1',
    scopeType: 'CHANNEL',
    type: 'mention',
    unavailable: false,
    workspaceId: 'ws-1',
    ...overrides,
  };
}

describe('describeActivity — câu mô tả theo type/kind (p1-07 app.md §3)', () => {
  it('mention trong kênh: "Minh nhắc đến bạn trong #frontend" + trích đoạn', () => {
    expect(describeActivity(make({}))).toEqual({
      excerpt: 'xem giúp mình nhé',
      title: 'Minh nhắc đến bạn trong #frontend',
    });
  });

  it('thread.reply: FIRST_REPLY khác THREAD_REPLY', () => {
    expect(describeActivity(make({ kind: 'FIRST_REPLY', type: 'thread.reply' })).title).toBe(
      'Minh đã trả lời tin nhắn của bạn trong #frontend',
    );
    expect(describeActivity(make({ kind: 'THREAD_REPLY', type: 'thread.reply' })).title).toBe(
      'Minh trả lời luồng bạn theo dõi trong #frontend',
    );
  });

  it('được thêm vào kênh riêng tư / cập nhật quản trị', () => {
    expect(describeActivity(make({ type: 'channel.private-added' })).title).toBe(
      'Bạn được thêm vào kênh riêng tư #frontend',
    );
    expect(describeActivity(make({ type: 'moderation.warning' })).title).toMatch(/nhắc nhở/);
  });

  it('loại lạ → câu trung tính, không ném', () => {
    expect(describeActivity(make({ type: 'gi.do.moi' })).title).toBe('Bạn có thông báo mới');
    // `meeting.*` giờ có câu riêng theo loại (trước đây mọi loại họp cùng "Cập nhật về cuộc họp"); loại họp lạ vẫn có câu trung tính.
    expect(describeActivity(make({ type: 'meeting.invited' })).title).toBe(
      'Bạn được mời tham dự một cuộc họp',
    );
    expect(describeActivity(make({ type: 'meeting.gi-do-moi' })).title).toBe(
      'Cập nhật về cuộc họp',
    );
  });

  it('⛔ mục MẤT QUYỀN không lộ tên người/kênh/nội dung (UX riêng §7)', () => {
    const unavailable = make({
      actor: { avatarUrl: null, name: 'Minh', userId: 'u1' },
      context: { available: false, muted: false },
      unavailable: true,
    });
    const description = describeActivity(unavailable);
    expect(description).toEqual({ title: UNAVAILABLE_TITLE });
    expect(JSON.stringify(description)).not.toMatch(/Minh|frontend/);
  });

  it('context.available=false một mình cũng đủ coi là không khả dụng', () => {
    const item = make({ context: { available: false, muted: false } });
    expect(isInboxItemUnavailable(item)).toBe(true);
    expect(describeActivity(item).title).toBe(UNAVAILABLE_TITLE);
  });
});

describe('inboxItemTarget', () => {
  it('lấy messageId/threadId từ mục, id thẻ từ refs; threadId là id TIN GỐC', () => {
    expect(
      inboxItemTarget(
        make({
          messageId: 'm9',
          refs: { boardId: 'b1', taskId: 't1' },
          threadId: 'root-1',
          type: 'thread.reply',
        }),
      ),
    ).toEqual({
      boardId: 'b1',
      messageId: 'm9',
      rootMessageId: 'root-1',
      scopeId: 'ch-1',
      scopeType: 'CHANNEL',
      taskId: 't1',
      type: 'thread.reply',
      workspaceId: 'ws-1',
    });
  });

  it('thiếu trên mục thì dò trong refs; workspaceId rơi về refs', () => {
    const target = inboxItemTarget(
      make({ refs: { messageId: 'm2', workspaceId: 'ws-9' }, workspaceId: null }),
    );
    expect(target.messageId).toBe('m2');
    expect(target.workspaceId).toBe('ws-9');
  });
});
