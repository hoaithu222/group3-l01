import { apiClient } from '@/core/api/client';

import { workspaceSearchService } from '../api/workspace-search.service';

/**
 * Nguồn cho bộ lọc (người gửi, phạm vi) + tham gia kênh + đọc vai trò nhóm — mọi lượt gọi `skipErrorToast` để lỗi hiện TẠI CHỖ. Chính
 * lượt `search`: `workspace-search.service.test.ts`.
 */
jest.mock('@/core/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockedGet = jest.mocked(apiClient.get);
const mockedPost = jest.mocked(apiClient.post);
const envelope = (data: unknown, extra?: Record<string, unknown>) =>
  ({ data: { success: true, data, ...extra } }) as never;

beforeEach(() => jest.clearAllMocks());

describe('workspaceSearchService — nguồn cho bộ lọc', () => {
  it('listAuthors: thành viên ACTIVE, ưu tiên tên hiển thị trong nhóm; không có q thì không gửi q', async () => {
    mockedGet.mockResolvedValue(
      envelope([
        {
          userId: 'u-1',
          name: 'Nguyễn An',
          displayName: ' An (Trưởng nhóm) ',
          avatarUrl: 'https://x/a.png',
        },
        { userId: 'u-2', name: 'Trần Bình', displayName: null },
      ]),
    );

    const authors = await workspaceSearchService.listAuthors('ws-1', '');

    expect(mockedGet).toHaveBeenCalledWith('/workspaces/ws-1/members', {
      params: { limit: 50, page: 1, q: undefined, sort: 'name', status: 'ACTIVE' },
      skipErrorToast: true,
    });
    expect(authors).toEqual([
      { userId: 'u-1', name: 'An (Trưởng nhóm)', avatarUrl: 'https://x/a.png' },
      { userId: 'u-2', name: 'Trần Bình', avatarUrl: null },
    ]);
  });

  it('listScopes: kênh (đã vào + công khai khám phá được) và NHÓM CHAT của nhóm này; bỏ hội thoại 1-1', async () => {
    mockedGet.mockImplementation(async (url) =>
      url === '/workspaces/ws-1/channels'
        ? envelope({
            discoverable: [{ id: 'ch-2', name: 'do-an', visibility: 'PUBLIC' }],
            joined: [{ id: 'ch-1', name: 'chung', visibility: 'PRIVATE' }],
          })
        : envelope(
            [
              { id: 'cv-1', kind: 'GROUP', title: 'Nhóm học tập' },
              { id: 'cv-2', kind: 'DIRECT', title: null },
              { id: 'cv-3', kind: 'GROUP', title: '   ' },
            ],
            { meta: {} },
          ),
    );

    const scopes = await workspaceSearchService.listScopes('ws-1');

    expect(mockedGet).toHaveBeenCalledWith('/conversations', {
      params: { filter: 'group', limit: 50, workspaceId: 'ws-1' },
      skipErrorToast: true,
    });
    expect(scopes).toEqual([
      { type: 'CHANNEL', id: 'ch-1', name: 'chung', isPrivate: true },
      { type: 'CHANNEL', id: 'ch-2', name: 'do-an', isPrivate: false },
      { type: 'CONVERSATION', id: 'cv-1', name: 'Nhóm học tập', isPrivate: true },
      { type: 'CONVERSATION', id: 'cv-3', name: 'Nhóm chat', isPrivate: true },
    ]);
  });

  it('joinChannel: POST /channels/:id/join; getWorkspaceHead: trả NGUYÊN phản hồi (khoá cache dùng chung với useWorkspace)', async () => {
    mockedPost.mockResolvedValue(envelope({}));
    mockedGet.mockResolvedValue(
      envelope({ id: 'ws-1', myRole: 'GUEST', name: 'Nhóm A', status: 'ACTIVE' }),
    );

    await workspaceSearchService.joinChannel('ch-2');
    const head = await workspaceSearchService.getWorkspaceHead('ws-1');

    expect(mockedPost).toHaveBeenCalledWith('/channels/ch-2/join', undefined, {
      skipErrorToast: true,
    });
    expect(head).toEqual({ id: 'ws-1', myRole: 'GUEST', name: 'Nhóm A', status: 'ACTIVE' });
  });
});
