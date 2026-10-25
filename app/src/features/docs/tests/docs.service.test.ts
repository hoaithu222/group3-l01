import { apiClient } from '@/core/api/client';

import { CollabGrantError, docsCollabService } from '../api/docs-collab.service';
import { docsService } from '../api/docs.service';

/**
 * Hợp đồng REST của Real-time Docs với BE (`be/src/modules/documents`): đường dẫn, phong bì, `Idempotency-Key`, `expectedVersion`/`confirmPublic`, cursor ở
 * `meta`, phản hồi `collab-token`. Mọi lời gọi bật `skipErrorToast` (màn tự hiện lỗi đúng chỗ). Mã lỗi `DOC_*`: `docs-errors.test.ts`.
 */
jest.mock('@/core/api/client', () => ({
  apiClient: { delete: jest.fn(), get: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));

const api = jest.mocked(apiClient);
const DOC = '0123456789abcdef01234567';

beforeEach(() => jest.clearAllMocks());

describe('docsService', () => {
  it('list: lọc q/status ở server, cursor lấy từ meta (không từ data)', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 'd1' }], meta: { nextCursor: 'abc' } } });
    const page = await docsService.list('ws1', { q: 'kế hoạch', status: 'ARCHIVED' }, 'c0');
    expect(api.get).toHaveBeenCalledWith('/workspaces/ws1/documents', {
      params: { cursor: 'c0', limit: 20, q: 'kế hoạch', status: 'ARCHIVED' },
      skipErrorToast: true,
    });
    expect(page).toEqual({ items: [{ id: 'd1' }], nextCursor: 'abc' });
  });

  it('list: q rỗng không gửi lên server', async () => {
    api.get.mockResolvedValue({ data: { data: [], meta: {} } });
    await docsService.list('ws1', { q: '', status: 'ACTIVE' });
    expect(api.get.mock.calls[0]?.[1]).toMatchObject({
      params: { q: undefined, status: 'ACTIVE' },
    });
  });

  it('create: gửi Idempotency-Key + payload đúng DTO, bóc phong bì', async () => {
    api.post.mockResolvedValue({ data: { data: { id: 'd9' }, success: true } });
    const created = await docsService.create(
      'ws1',
      { title: 'Mới', visibility: 'PRIVATE' },
      'doc-create-key',
    );
    expect(api.post).toHaveBeenCalledWith(
      '/workspaces/ws1/documents',
      { title: 'Mới', visibility: 'PRIVATE' },
      { headers: { 'Idempotency-Key': 'doc-create-key' }, skipErrorToast: true },
    );
    expect(created).toEqual({ id: 'd9' });
  });

  it('update: gửi nguyên payload (expectedVersion, confirmPublic) tới PATCH /documents/:id', async () => {
    api.patch.mockResolvedValue({ data: { data: { id: DOC } } });
    await docsService.update(DOC, {
      confirmPublic: true,
      expectedVersion: 4,
      visibility: 'WORKSPACE',
    });
    expect(api.patch).toHaveBeenCalledWith(
      `/documents/${DOC}`,
      { confirmPublic: true, expectedVersion: 4, visibility: 'WORKSPACE' },
      { skipErrorToast: true },
    );
  });

  it('workspaceAccess: khách hoặc nhóm không hoạt động → không được tạo', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { myRole: 'GUEST', status: 'ACTIVE' } } });
    expect((await docsService.workspaceAccess('ws1')).canCreate).toBe(false);
    api.get.mockResolvedValueOnce({ data: { data: { myRole: 'MEMBER', status: 'ARCHIVED' } } });
    expect((await docsService.workspaceAccess('ws1')).canCreate).toBe(false);
    api.get.mockResolvedValueOnce({ data: { data: { myRole: 'MEMBER', status: 'ACTIVE' } } });
    expect((await docsService.workspaceAccess('ws1')).canCreate).toBe(true);
  });
});

describe('docsCollabService', () => {
  it('issueToken: POST …/collab-token → grant (expiresAt ISO → ms); phản hồi sai hình dạng → CollabGrantError không lộ nội dung', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        data: {
          documentName: `doc:${DOC}`,
          expiresAt: '2026-09-27T10:05:00.000Z',
          limits: { stateMaxBytes: 1024 },
          mode: 'view',
          token: 'a.b.c',
          url: 'wss://x.example/collab',
          user: { color: '#175CD3', id: 'u1', name: 'Lan' },
        },
      },
    });
    const grant = await docsCollabService.issueToken(DOC);
    expect(api.post).toHaveBeenCalledWith(
      `/documents/${DOC}/collab-token`,
      {},
      { skipErrorToast: true },
    );
    expect(grant).toMatchObject({
      expiresAt: Date.parse('2026-09-27T10:05:00.000Z'),
      mode: 'view',
      stateMaxBytes: 1024,
    });

    api.post.mockResolvedValueOnce({ data: { data: { token: 'bí-mật', url: 'https://sai' } } });
    const failure = await docsCollabService.issueToken(DOC).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CollabGrantError);
    expect(String((failure as Error).message)).not.toContain('bí-mật');
  });

  it('addCollaborators/removeCollaborator/restoreSnapshot dùng đúng đường dẫn và thân', async () => {
    api.post.mockResolvedValue({ data: { data: [] } });
    await docsCollabService.addCollaborators(DOC, ['u2'], 'VIEWER');
    expect(api.post).toHaveBeenLastCalledWith(
      `/documents/${DOC}/collaborators`,
      { role: 'VIEWER', userIds: ['u2'] },
      { skipErrorToast: true },
    );
    await docsCollabService.restoreSnapshot(DOC, 's1', 7);
    expect(api.post).toHaveBeenLastCalledWith(
      `/documents/${DOC}/snapshots/s1/restore`,
      { expectedVersion: 7 },
      { skipErrorToast: true },
    );
    await docsCollabService.removeCollaborator(DOC, 'u2');
    expect(api.delete).toHaveBeenCalledWith(`/documents/${DOC}/collaborators/u2`, {
      skipErrorToast: true,
    });
  });
});
