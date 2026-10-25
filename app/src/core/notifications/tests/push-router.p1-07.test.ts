import { parsePushPayload, type PushPayload } from '../push-payload.types';
import { resolvePushHref } from '../push-router';

/**
 * p1-07 `be.md` §15.4: push `thread.reply` mang `rootMessageId` (id TIN GỐC — KHÔNG phải `Thread.id`) → mở màn luồng; push gộp
 * không nhảy tới tin cụ thể; `task.*` mang `boardId`/`taskId`. Bảng `type → route` đầy đủ: `notification-route.test.ts`.
 */

function make(overrides: Record<string, string>): PushPayload {
  const parsed = parsePushPayload({ targetUserId: 'user-me', ...overrides });
  if (!parsed) throw new Error('payload dựng sai');
  return parsed;
}

describe('resolvePushHref — hợp đồng push p1-07', () => {
  it('thread.reply → mở MÀN LUỒNG của tin gốc, m = tin trả lời (be.md p1-07 §15.4: rootMessageId)', () => {
    expect(
      resolvePushHref(
        make({
          messageId: 'reply-1',
          rootMessageId: 'root-1',
          scopeId: 'ch-1',
          scopeType: 'CHANNEL',
          threadId: 'root-1',
          type: 'thread.reply',
          workspaceId: 'ws-1',
        }),
      ),
    ).toEqual({
      params: { chId: 'ch-1', m: 'reply-1', messageId: 'root-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
    });
  });

  it('thread.reply payload cũ (chỉ có threadId, chưa có rootMessageId) → coi threadId là id tin gốc', () => {
    expect(
      resolvePushHref(
        make({
          messageId: 'reply-1',
          scopeId: 'ch-1',
          scopeType: 'CHANNEL',
          threadId: 'root-1',
          type: 'thread.reply',
          workspaceId: 'ws-1',
        }),
      ),
    ).toEqual({
      params: { chId: 'ch-1', m: 'reply-1', messageId: 'root-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
    });
  });

  it('tin GỘP (count > 1) không nhảy tới tin cụ thể — kể cả mention', () => {
    expect(
      resolvePushHref(
        make({
          count: '4',
          messageId: 'm9',
          scopeId: 'conv-1',
          scopeType: 'CONVERSATION',
          type: 'mention',
        }),
      ),
    ).toEqual({ params: { conversationId: 'conv-1' }, pathname: '/messages/[conversationId]' });
  });

  it('task.assigned có boardId → thẳng chi tiết thẻ; thiếu boardId → route giải boardId', () => {
    expect(
      resolvePushHref(
        make({ boardId: 'b1', taskId: 't1', type: 'task.assigned', workspaceId: 'ws-1' }),
      ),
    ).toEqual({
      params: { boardId: 'b1', taskId: 't1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    });
    expect(
      resolvePushHref(make({ taskId: 't1', type: 'task.comment', workspaceId: 'ws-1' })),
    ).toEqual({
      params: { taskId: 't1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/tasks/[taskId]',
    });
  });

  it('task.* thiếu id để dựng route → về /activity', () => {
    expect(resolvePushHref(make({ type: 'task.due-soon' }))).toBe('/activity');
  });
});
