import { buildMessageHref } from '../utils/open-message';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('buildMessageHref — mở đúng tin (`?m=` = around)', () => {
  it('tin gốc ở kênh → route kênh + m', () => {
    expect(
      buildMessageHref({ scopeType: 'CHANNEL', scopeId: 'ch-1', workspaceId: 'ws-1', messageId: 'm-9' }),
    ).toEqual({
      pathname: '/workspaces/[wsId]/channels/[chId]',
      params: { wsId: 'ws-1', chId: 'ch-1', m: 'm-9' },
    });
  });

  it('reply trong luồng (SAV-05) → màn luồng của TIN GỐC, m = reply', () => {
    expect(
      buildMessageHref({
        scopeType: 'CHANNEL',
        scopeId: 'ch-1',
        workspaceId: 'ws-1',
        messageId: 'reply-3',
        threadRootId: 'root-1',
      }),
    ).toEqual({
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
      params: { wsId: 'ws-1', chId: 'ch-1', messageId: 'root-1', m: 'reply-3' },
    });
  });

  it('tin hội thoại → route hội thoại + m (không cần workspaceId, bỏ qua threadRootId)', () => {
    expect(
      buildMessageHref({
        scopeType: 'CONVERSATION',
        scopeId: 'cv-1',
        workspaceId: null,
        messageId: 'm-2',
        threadRootId: 'x',
      }),
    ).toEqual({
      pathname: '/messages/[conversationId]',
      params: { conversationId: 'cv-1', m: 'm-2' },
    });
  });

  it('kênh mà thiếu workspaceId → null (không dựng route hỏng)', () => {
    expect(
      buildMessageHref({ scopeType: 'CHANNEL', scopeId: 'ch-1', workspaceId: null, messageId: 'm-1' }),
    ).toBeNull();
    expect(
      buildMessageHref({ scopeType: 'CHANNEL', scopeId: 'ch-1', workspaceId: undefined, messageId: 'm-1' }),
    ).toBeNull();
  });
});
