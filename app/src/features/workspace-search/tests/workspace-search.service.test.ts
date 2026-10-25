import { apiClient } from '@/core/api/client';

import { workspaceSearchService } from '../api/workspace-search.service';
import {
  makeChannelHit,
  makeFileHit,
  makeMeetingHit,
  makeMessageHit,
  makePersonHit,
  meta,
} from './fixtures';

/**
 * Hợp đồng BE thật (be/src/modules/workspace-search, đọc trực tiếp từ mã): `GET /workspaces/:id/search` trả `{ data, meta }` Ở GỐC
 * thân phản hồi — service phải đọc CẢ `meta` (bẫy `unwrapData` vứt `meta`), gắn loại + khoá ổn định cho từng dòng, và dùng
 * `skipErrorToast` (lỗi `SRCH_*`/404/429 hiện TẠI CHỖ). Nguồn cho bộ lọc + tham gia kênh: `workspace-search.service.sources.test.ts`.
 */
jest.mock('@/core/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockedGet = jest.mocked(apiClient.get);
const envelope = (data: unknown, extra?: Record<string, unknown>) =>
  ({ data: { success: true, data, ...extra } }) as never;

beforeEach(() => jest.clearAllMocks());

describe('workspaceSearchService.search', () => {
  it('GET /workspaces/:id/search — mọi tham số đi nguyên; đọc cả meta.partial/truncated', async () => {
    const pageMeta = meta({ hasMore: true, nextCursor: 'c2', partial: true, truncated: true });
    mockedGet.mockResolvedValue(envelope([makeMessageHit()], { meta: pageMeta }));

    const page = await workspaceSearchService.search('ws-1', {
      authorId: 'u-1',
      cursor: 'c1',
      from: '2026-09-01T00:00:00.000Z',
      hasFile: true,
      includeDirect: true,
      q: 'đồ án',
      scopeId: 'ch-1',
      scopeType: 'CHANNEL',
      to: '2026-09-05T23:59:59.999Z',
      type: 'messages',
    });

    expect(mockedGet).toHaveBeenCalledWith('/workspaces/ws-1/search', {
      params: {
        authorId: 'u-1',
        cursor: 'c1',
        from: '2026-09-01T00:00:00.000Z',
        hasFile: true,
        includeDirect: true,
        q: 'đồ án',
        scopeId: 'ch-1',
        scopeType: 'CHANNEL',
        to: '2026-09-05T23:59:59.999Z',
        type: 'messages',
      },
      skipErrorToast: true,
    });
    expect(page.meta).toEqual(pageMeta);
    expect(page.data).toEqual([
      { type: 'messages', key: 'm-1', hit: expect.objectContaining({ messageId: 'm-1' }) },
    ]);
  });

  it('gắn LOẠI + khoá ổn định theo từng loại kết quả', async () => {
    mockedGet.mockResolvedValueOnce(envelope([makeFileHit({ assetId: 'a-1' })], { meta: meta() }));
    mockedGet.mockResolvedValueOnce(
      envelope(
        [makeFileHit({ assetId: 'a-2', source: { kind: 'RESOURCE', resourceId: 'res-9' } })],
        { meta: meta() },
      ),
    );
    mockedGet.mockResolvedValueOnce(envelope([makeChannelHit()], { meta: meta() }));
    mockedGet.mockResolvedValueOnce(envelope([makePersonHit()], { meta: meta() }));
    mockedGet.mockResolvedValueOnce(envelope([makeMeetingHit()], { meta: meta() }));

    const files = await workspaceSearchService.search('ws-1', { q: 'ab', type: 'files' });
    const resources = await workspaceSearchService.search('ws-1', { q: 'ab', type: 'files' });
    const channels = await workspaceSearchService.search('ws-1', { q: 'ab', type: 'channels' });
    const people = await workspaceSearchService.search('ws-1', { q: 'ab', type: 'people' });
    const meetings = await workspaceSearchService.search('ws-1', { q: 'ab', type: 'meetings' });

    // Một tin có thể kèm nhiều tệp: khoá ghép id nguồn với `assetId` để không trùng giữa hai nguồn.
    expect(files.data[0]?.key).toBe('m-1:a-1');
    expect(resources.data[0]?.key).toBe('res-9:a-2');
    expect(channels.data[0]).toMatchObject({ type: 'channels', key: 'ch-2' });
    expect(people.data[0]).toMatchObject({ type: 'people', key: 'u-an' });
    expect(meetings.data[0]).toMatchObject({ type: 'meetings', key: 'mt-1' });
  });
});
