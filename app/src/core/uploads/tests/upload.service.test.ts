import { apiClient } from '@/core/api';

import { uploadService } from '../upload.service';

import { baseAsset } from './fixtures';

/**
 * Tầng HTTP thuần (`uploadService`) — chọn PRESIGNED_PUT/API_PUT và
 * complete→PROCESSING→poll READY nằm ở `upload.pipeline.test.ts` (tách để cả
 * hai file dưới trần 150 dòng của `check-file-size.mjs`).
 */
jest.mock('@/core/api', () => {
  const actual = jest.requireActual('@/core/api');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: jest.fn(), post: jest.fn(), put: jest.fn() },
  };
});

const mockedPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;
const mockedGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('uploadService — tầng HTTP', () => {
  it('createAsset gửi header Idempotency-Key và path /assets', async () => {
    mockedPost.mockResolvedValue({
      data: { asset: baseAsset(), upload: { method: 'API_PUT', url: '/assets/asset-1/content' } },
    } as never);

    await uploadService.createAsset(
      { scope: 'MESSAGE', kind: 'IMAGE', fileName: 'a.jpg', mime: 'image/jpeg', size: 1024 },
      'local-1',
    );

    expect(mockedPost).toHaveBeenCalledWith(
      '/assets',
      expect.objectContaining({ fileName: 'a.jpg' }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'local-1' } }),
    );
  });

  it('abortAsset bỏ qua toast lỗi mặc định (huỷ chủ động không cần báo động)', async () => {
    mockedPost.mockResolvedValue({ data: { status: 'DELETED' } } as never);

    await uploadService.abortAsset('asset-1');

    expect(mockedPost).toHaveBeenCalledWith(
      '/assets/asset-1/abort',
      undefined,
      expect.objectContaining({ skipErrorToast: true }),
    );
  });

  it('getAssetUrl truyền đúng variant qua query', async () => {
    mockedGet.mockResolvedValue({ data: { url: 'https://x', expiresAt: '' } } as never);

    await uploadService.getAssetUrl('asset-1', 'THUMB');

    expect(mockedGet).toHaveBeenCalledWith(
      '/assets/asset-1/url',
      expect.objectContaining({ params: { variant: 'THUMB' } }),
    );
  });
});
