import { apiClient } from '@/core/api/client';

import { foldersService } from '../api/folders.service';
import { resourcesService } from '../api/resources.service';

/**
 * Hợp đồng gọi API với `be.md` p3-01 §4 — những chỗ SAI THÌ IM LẶNG:
 *  · `recursive` luôn là CHUỖI "true"|"false" (BE `z.enum`, không `z.coerce.boolean()`);
 *  · `q` có ⇒ bỏ `folderId` (BE tìm toàn workspace);
 *  · tạo tệp mang `Idempotency-Key`.
 */
jest.mock('@/core/api/client', () => ({
  apiClient: {
    delete: jest.fn(),
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const mockedApi = jest.mocked(apiClient);

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.get.mockResolvedValue({
    data: { data: [], meta: { hasMore: false, limit: 30, nextCursor: null } },
  });
  mockedApi.post.mockResolvedValue({ data: { data: { id: 'x' } } });
  mockedApi.delete.mockResolvedValue({ data: undefined });
});

describe('foldersService', () => {
  it('xoá KHÔNG đệ quy ⇒ gửi CHUỖI "false" tường minh (BE z.enum, không ép boolean)', async () => {
    await foldersService.remove('f1', false);
    expect(mockedApi.delete).toHaveBeenCalledWith('/folders/f1', {
      params: { recursive: 'false' },
    });
  });

  it('xoá đệ quy ⇒ gửi chuỗi recursive="true"', async () => {
    await foldersService.remove('f1', true);
    expect(mockedApi.delete).toHaveBeenCalledWith('/folders/f1', {
      params: { recursive: 'true' },
    });
  });

  it('danh sách gốc không gửi parentId; thư mục con gửi parentId', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: { breadcrumb: [], children: [] } } });
    await foldersService.list('ws1');
    expect(mockedApi.get).toHaveBeenLastCalledWith('/workspaces/ws1/folders', {
      params: undefined,
    });
    await foldersService.list('ws1', 'f9');
    expect(mockedApi.get).toHaveBeenLastCalledWith('/workspaces/ws1/folders', {
      params: { parentId: 'f9' },
    });
  });

  it('tạo/đổi tên bỏ toast toàn cục — lỗi RSC_002 hiện tại ô tên', async () => {
    await foldersService.create('ws1', { name: 'A' });
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/workspaces/ws1/folders',
      { name: 'A' },
      { skipErrorToast: true },
    );
  });
});

describe('resourcesService', () => {
  it('duyệt thư mục: folderId + sort + limit; gốc = "root"', async () => {
    await resourcesService.list('ws1', { order: 'desc', sort: 'createdAt' }, undefined, 30);
    expect(mockedApi.get).toHaveBeenCalledWith('/workspaces/ws1/resources', {
      params: {
        cursor: undefined,
        folderId: 'root',
        limit: 30,
        order: 'desc',
        sort: 'createdAt',
        type: undefined,
      },
    });
  });

  it('tìm (q ≥ 2 ký tự) ⇒ gửi q và BỎ folderId', async () => {
    await resourcesService.list(
      'ws1',
      { folderId: 'f1', order: 'asc', q: '  giáo trình ', sort: 'name' },
      'cur',
      30,
    );
    const call = mockedApi.get.mock.calls[0]?.[1] as { params: Record<string, unknown> };
    expect(call.params.q).toBe('giáo trình');
    expect('folderId' in call.params).toBe(false);
    expect(call.params.cursor).toBe('cur');
  });

  it('q quá ngắn (1 ký tự) ⇒ coi như không tìm, vẫn duyệt thư mục', async () => {
    await resourcesService.list(
      'ws1',
      { folderId: 'f1', order: 'asc', q: 'a', sort: 'name' },
      undefined,
      30,
    );
    const call = mockedApi.get.mock.calls[0]?.[1] as { params: Record<string, unknown> };
    expect('q' in call.params).toBe(false);
    expect(call.params.folderId).toBe('f1');
  });

  it('tạo tệp mang Idempotency-Key và bỏ toast toàn cục', async () => {
    await resourcesService.create('ws1', { assetId: 'a1', folderId: 'f1' }, 'rsc-1');
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/workspaces/ws1/resources',
      { assetId: 'a1', folderId: 'f1' },
      { headers: { 'Idempotency-Key': 'rsc-1' }, skipErrorToast: true },
    );
  });

  it('URL ký xin đúng biến thể; xoá vĩnh viễn đúng đường dẫn thùng rác', async () => {
    mockedApi.get.mockResolvedValue({
      data: { data: { url: 'https://s/x', expiresAt: 'x', mime: 'a', disposition: 'inline' } },
    });
    await resourcesService.url('r1', 'download');
    expect(mockedApi.get).toHaveBeenLastCalledWith('/resources/r1/url', {
      params: { variant: 'download' },
      skipErrorToast: true,
    });
    await resourcesService.purge('ws1', 'r1');
    expect(mockedApi.delete).toHaveBeenLastCalledWith('/workspaces/ws1/trash/r1');
  });
});
