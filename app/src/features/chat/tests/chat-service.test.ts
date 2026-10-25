import { apiClient } from '@/core/api/client';

import { chatService } from '../api/chat.service';
import { makeMessage } from '../cache/apply-socket-event.fixtures';

jest.mock('@/core/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const MINH = '507f1f77bcf86cd799439011';

describe('chatService — hợp đồng với BE', () => {
  beforeEach(() => jest.clearAllMocks());

  it('list đọc meta + anchorMessageId từ thân phản hồi (unwrapData vứt mất meta → useMessages nổ)', async () => {
    const meta = {
      nextBeforeSeq: 1,
      nextAfterSeq: 9,
      hasMoreBefore: false,
      hasMoreAfter: true,
      limit: 30,
    };
    jest.mocked(apiClient.get).mockResolvedValue({
      data: { success: true, data: [makeMessage({})], meta, anchorMessageId: 'a-1' },
    });
    const page = await chatService.list(
      { scopeType: 'CHANNEL', scopeId: 'ch-1', threadId: 'root-1' },
      { beforeSeq: 5 },
    );
    expect(page.data).toHaveLength(1);
    expect(page.meta).toEqual(meta);
    expect(page.anchorMessageId).toBe('a-1');
    expect(apiClient.get).toHaveBeenCalledWith('/scopes/CHANNEL/ch-1/messages', {
      params: { beforeSeq: 5, threadId: 'root-1' },
    });
  });

  it('listReactors đổi meta.nextCursor thành cursor cho WhoReactedSheet', async () => {
    jest.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [{ userId: 'u1', emoji: '👍', createdAt: 'x' }],
        meta: { nextCursor: 'c2', hasMore: true, limit: 20 },
      },
    });
    const page = await chatService.listReactors('m-1', '👍');
    expect(page).toEqual({ data: [{ userId: 'u1', emoji: '👍', createdAt: 'x' }], cursor: 'c2' });
  });

  it('send: mentions gửi lên KHÔNG có label/targetId null; reply trong luồng mang threadRootId', async () => {
    jest.mocked(apiClient.post).mockResolvedValue({ data: { data: makeMessage({}) } });
    await chatService.send(
      { scopeType: 'CHANNEL', scopeId: 'ch-1', threadId: 'root-1' },
      {
        clientMessageId: 'c1',
        content: `hi @{u:${MINH}} @{all}`,
        mentions: [
          { type: 'USER', targetId: MINH, label: 'Minh' },
          { type: 'ALL', targetId: null, label: 'Tất cả' },
        ],
      },
    );
    const body = jest.mocked(apiClient.post).mock.calls[0]?.[1] as {
      mentions: unknown[];
      threadRootId: string;
    };
    expect(body.mentions).toEqual([{ type: 'USER', targetId: MINH }, { type: 'ALL' }]);
    expect(body.threadRootId).toBe('root-1');
  });

  it('edit luôn kèm mentions (BE mặc định [] → content còn marker sẽ MISMATCH)', async () => {
    jest.mocked(apiClient.patch).mockResolvedValue({ data: { data: makeMessage({}) } });
    await chatService.edit('m-1', {
      content: `@{u:${MINH}}`,
      expectedVersion: 2,
      mentions: [{ type: 'USER', targetId: MINH, label: 'Minh' }],
    });
    const body = jest.mocked(apiClient.patch).mock.calls[0]?.[1] as { mentions: unknown[] };
    expect(body.mentions).toEqual([{ type: 'USER', targetId: MINH }]);
  });
});
