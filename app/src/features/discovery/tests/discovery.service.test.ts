import { apiClient } from '@/core/api/client';

import { discoveryService } from '../api/discovery.service';

/**
 * Hợp đồng BE thật (be/src/modules/discovery + messages/pins-query): danh sách cursor trả `{ data, meta }` Ở GỐC thân
 * phản hồi — service phải đọc CẢ `meta` (bẫy `unwrapData` vứt `meta`), và tìm/ghim dùng `skipErrorToast`.
 */
jest.mock('@/core/api/client', () => ({
  apiClient: { get: jest.fn(), delete: jest.fn() },
}));

const mockedGet = jest.mocked(apiClient.get);
const mockedDelete = jest.mocked(apiClient.delete);
const envelope = (data: unknown, meta?: unknown) => ({ data: { success: true, data, meta } }) as never;

const CHANNEL = { scopeType: 'CHANNEL', scopeId: 'ch-1' } as const;
const CONVERSATION = { scopeType: 'CONVERSATION', scopeId: 'cv-1' } as const;

beforeEach(() => jest.clearAllMocks());

describe('discoveryService', () => {
  it('listSaved: GET /me/saved với bộ lọc + cursor; trả { data, meta } (không mất meta)', async () => {
    const meta = { nextCursor: 'c2', hasMore: true, limit: 30 };
    mockedGet.mockResolvedValue(envelope([{ savedAt: 'x', messageId: 'm-1', available: false }], meta));

    const page = await discoveryService.listSaved({ scopeType: 'CHANNEL', workspaceId: 'ws-1', cursor: 'c1', limit: 30 });

    expect(mockedGet).toHaveBeenCalledWith('/me/saved', {
      params: { scopeType: 'CHANNEL', workspaceId: 'ws-1', cursor: 'c1', limit: 30 },
      skipErrorToast: true,
    });
    expect(page.meta).toEqual(meta);
    expect(page.data).toHaveLength(1);
  });

  it('search: GET /scopes/:type/:id/search — mọi tham số đi nguyên; trả cả meta.partial', async () => {
    const meta = { nextCursor: null, hasMore: false, limit: 30, partial: true };
    mockedGet.mockResolvedValue(envelope([], meta));

    const page = await discoveryService.search(CHANNEL, {
      q: 'đồ án',
      authorId: 'u-1',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-05T23:59:59.999Z',
      fileKind: 'IMAGE',
      includeThreads: false,
      cursor: 'abc',
    });

    expect(mockedGet).toHaveBeenCalledWith('/scopes/CHANNEL/ch-1/search', {
      params: {
        q: 'đồ án',
        authorId: 'u-1',
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-05T23:59:59.999Z',
        fileKind: 'IMAGE',
        includeThreads: false,
        cursor: 'abc',
      },
      skipErrorToast: true,
    });
    expect(page.meta.partial).toBe(true);
  });

  it('listPins: GET /scopes/:type/:id/pins, trả meta.total/max; unpin: DELETE /messages/:id/pin', async () => {
    const meta = { nextCursor: null, hasMore: false, limit: 30, total: 3, max: 10 };
    mockedGet.mockResolvedValue(envelope([], meta));
    mockedDelete.mockResolvedValue(envelope(null));

    const page = await discoveryService.listPins(CONVERSATION, 'cur');
    await discoveryService.unpin('p-1');

    expect(mockedGet).toHaveBeenCalledWith('/scopes/CONVERSATION/cv-1/pins', {
      params: { cursor: 'cur' },
      skipErrorToast: true,
    });
    expect(page.meta).toMatchObject({ total: 3, max: 10 });
    expect(mockedDelete).toHaveBeenCalledWith('/messages/p-1/pin');
  });

  it('listMembers KÊNH: lọc THEO SERVER bằng q (page/limit)', async () => {
    mockedGet.mockResolvedValue(envelope([{ userId: 'u-1', name: 'Bình', avatarUrl: null, presence: 'ONLINE' }]));

    const members = await discoveryService.listMembers(CHANNEL, 'bin');

    expect(mockedGet).toHaveBeenCalledWith('/channels/ch-1/members', {
      params: { page: 1, limit: 100, q: 'bin' },
      skipErrorToast: true,
    });
    expect(members).toEqual([{ userId: 'u-1', name: 'Bình', avatarUrl: null }]);
  });

  it('listMembers HỘI THOẠI: DTO không có q → lọc CLIENT, bỏ dấu ("binh" khớp "Bình")', async () => {
    mockedGet.mockResolvedValue(
      envelope([
        { userId: 'u-1', name: 'Bình', role: 'MEMBER' },
        { userId: 'u-2', name: 'An', role: 'MEMBER' },
      ]),
    );

    const members = await discoveryService.listMembers(CONVERSATION, 'binh');

    expect(mockedGet).toHaveBeenCalledWith('/conversations/cv-1/members', {
      params: { limit: 100 },
      skipErrorToast: true,
    });
    expect(members.map((m) => m.name)).toEqual(['Bình']);
  });

  it('listWorkspaces: bóc envelope, chỉ giữ id + name', async () => {
    mockedGet.mockResolvedValue(envelope([{ id: 'ws-1', name: 'Nhóm A', myRole: 'MEMBER', unreadCount: 3 }]));

    expect(await discoveryService.listWorkspaces()).toEqual([{ id: 'ws-1', name: 'Nhóm A' }]);
  });
});
