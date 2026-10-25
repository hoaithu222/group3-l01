import { hrefForTarget, hrefOrActivity, type NotificationTarget } from '../notification-route';

/**
 * Bảng `type → route` DÙNG CHUNG cho push và hộp thư Hoạt động (p1-07 `be.md` §15.3). Test khoá các quyết định dễ sai
 * mà `tsc` không thấy: id nào vào route nào, khi nào KHÔNG nhảy tới tin, khi nào không dựng nổi đích.
 */

function target(overrides: Partial<NotificationTarget> & { type: string }): NotificationTarget {
  return overrides;
}

describe('hrefForTarget — tin nhắn', () => {
  it('mention ở kênh (luồng chính) → kênh, m = tin', () => {
    expect(
      hrefForTarget(
        target({ messageId: 'm1', scopeId: 'ch', scopeType: 'CHANNEL', type: 'mention', workspaceId: 'ws' }),
      ),
    ).toEqual({
      params: { chId: 'ch', m: 'm1', wsId: 'ws' },
      pathname: '/workspaces/[wsId]/channels/[chId]',
    });
  });

  it('mention TRONG luồng (có rootMessageId) → màn luồng, m = tin nhắc tên', () => {
    expect(
      hrefForTarget(
        target({
          messageId: 'm1',
          rootMessageId: 'root',
          scopeId: 'ch',
          scopeType: 'CHANNEL',
          type: 'mention',
          workspaceId: 'ws',
        }),
      ),
    ).toEqual({
      params: { chId: 'ch', m: 'm1', messageId: 'root', wsId: 'ws' },
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
    });
  });

  it('thread.reply gộp (không m) vẫn vào ĐÚNG luồng để thấy các reply mới', () => {
    expect(
      hrefForTarget(
        target({
          coalesced: true,
          messageId: 'latest',
          rootMessageId: 'root',
          scopeId: 'ch',
          scopeType: 'CHANNEL',
          type: 'thread.reply',
          workspaceId: 'ws',
        }),
      ),
    ).toEqual({
      params: { chId: 'ch', messageId: 'root', wsId: 'ws' },
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
    });
  });

  it('message.new KHÔNG có tin đích: mở danh sách dù payload có messageId', () => {
    expect(
      hrefForTarget(target({ messageId: 'm1', scopeId: 'c1', scopeType: 'CONVERSATION', type: 'message.new' })),
    ).toEqual({ params: { conversationId: 'c1' }, pathname: '/messages/[conversationId]' });
  });

  it('mention.role được coi như mention (nhắc theo vai trò)', () => {
    expect(
      hrefForTarget(target({ messageId: 'm1', scopeId: 'c1', scopeType: 'CONVERSATION', type: 'mention.role' })),
    ).toEqual({ params: { conversationId: 'c1', m: 'm1' }, pathname: '/messages/[conversationId]' });
  });

  it('kênh thiếu workspaceId, hoặc thiếu scopeId → null (không dựng đường dẫn thiếu tham số)', () => {
    expect(hrefForTarget(target({ scopeId: 'ch', scopeType: 'CHANNEL', type: 'mention' }))).toBeNull();
    expect(hrefForTarget(target({ scopeType: 'CONVERSATION', type: 'mention' }))).toBeNull();
  });
});

describe('hrefForTarget — loại khác', () => {
  it('moderation.request → hàng đợi báo cáo của nhóm chat hoặc nhóm làm việc', () => {
    expect(
      hrefForTarget(target({ scopeId: 'c1', scopeType: 'CONVERSATION', type: 'moderation.request' })),
    ).toEqual({
      params: { conversationId: 'c1' },
      pathname: '/messages/[conversationId]/reports',
    });
    expect(hrefForTarget(target({ type: 'moderation.request', workspaceId: 'ws' }))).toEqual({
      params: { wsId: 'ws' },
      pathname: '/workspaces/[wsId]/reports',
    });
  });

  it('call.* → lịch sử cuộc gọi; meeting.* và loại lạ → null (hộp thư tự xử lý)', () => {
    expect(hrefForTarget(target({ type: 'call.missed' }))).toBe('/messages/calls');
    expect(hrefForTarget(target({ type: 'meeting.invited' }))).toBeNull();
    expect(hrefForTarget(target({ type: 'something.new' }))).toBeNull();
  });
});

describe('hrefOrActivity', () => {
  it('rơi về hộp thư khi không dựng được đích', () => {
    expect(hrefOrActivity(target({ type: 'meeting.invited' }))).toBe('/activity');
  });
});
