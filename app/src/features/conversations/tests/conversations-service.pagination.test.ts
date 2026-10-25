import { apiClient } from '@/core/api/client';

import { conversationsService } from '../api/conversations.service';

jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn() } }));

/**
 * Hợp đồng phân trang với BE THẬT (`ResponseUtils.cursor`): thân là `{ success, data: [...], meta }`.
 * `unwrapData` bóc `.data` và VỨT `meta` → `getNextPageParam: last.meta.hasMore` nổ trên mảng trần. Ba hàm
 * `list`/`listMembers`/`media` phải trả `{ data, meta }` nguyên vẹn (cùng bẫy đã sửa ở `chatService.list`).
 */
const META = { nextCursor: 'c2', hasMore: true, limit: 30 };
const body = (data: unknown[]) => ({ data: { success: true, message: 'ok', data, meta: META, timestamp: 'x' } });

describe('conversationsService — giữ `meta` phân trang', () => {
  beforeEach(() => jest.clearAllMocks());

  it('list: trả đủ data + meta để useInfiniteQuery đọc được hasMore/nextCursor', async () => {
    jest.mocked(apiClient.get).mockResolvedValue(body([{ id: 'cv-1' }]));
    const page = await conversationsService.list({ filter: 'all', limit: 30 });

    expect(page.data).toEqual([{ id: 'cv-1' }]);
    expect(page.meta).toEqual(META);
    expect(apiClient.get).toHaveBeenCalledWith('/conversations', { params: { filter: 'all', limit: 30 } });
  });

  it('listMembers: trả đủ data + meta', async () => {
    jest.mocked(apiClient.get).mockResolvedValue(body([{ userId: 'u-1' }]));
    const page = await conversationsService.listMembers('cv-1', { cursor: 'c1', limit: 50 });

    expect(page.data).toEqual([{ userId: 'u-1' }]);
    expect(page.meta).toEqual(META);
    expect(apiClient.get).toHaveBeenCalledWith('/conversations/cv-1/members', { params: { cursor: 'c1', limit: 50 } });
  });

  it('media: trả đủ data + meta', async () => {
    jest.mocked(apiClient.get).mockResolvedValue(body([{ messageId: 'm-1' }]));
    const page = await conversationsService.media('cv-1', 'MEDIA', 'c1', 30);

    expect(page.data).toEqual([{ messageId: 'm-1' }]);
    expect(page.meta).toEqual(META);
    expect(apiClient.get).toHaveBeenCalledWith('/conversations/cv-1/media', { params: { kind: 'MEDIA', cursor: 'c1', limit: 30 } });
  });

  it('các endpoint KHÔNG phân trang vẫn bóc `.data` như cũ (get)', async () => {
    jest.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: { id: 'cv-1' } } });
    expect(await conversationsService.get('cv-1')).toEqual({ id: 'cv-1' });
  });
});
