import * as FileSystem from 'expo-file-system/legacy';

import { apiClient } from '@/core/api';

import { runItem } from '../upload.pipeline';
import { useUploadStore } from '../upload.store';

import { baseAsset, seedItem, statusOf } from './fixtures';

/**
 * `runItem` (`upload.pipeline.ts`) — chọn đúng PRESIGNED_PUT/API_PUT và
 * complete → PROCESSING → poll READY (be.md §3, app.md §8 "upload.service.test.ts"
 * — tên file trong plan gộp việc này vào "service", lượt cài đặt tách
 * `upload.pipeline.ts`/`upload.transport.ts`/`upload.poll.ts` riêng để giữ
 * trần 150 dòng/file, xem chú thích ở các file đó). Mock Ở BIÊN I/O thật
 * (`apiClient` + `expo-file-system/legacy`), KHÔNG mock `upload.service`/
 * `upload.transport` — chạy qua ĐÚNG logic thật.
 *
 * Các ca API_PUT "BE tự chốt asset" + thử lại nằm ở `upload.pipeline.api-put.test.ts` (tách cho dưới trần 150 dòng).
 */
jest.mock('@/core/api', () => {
  const actual = jest.requireActual('@/core/api');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: jest.fn(), post: jest.fn(), put: jest.fn() },
  };
});

jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  createUploadTask: jest.fn(),
}));

const mockedPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;
const mockedGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
const mockedPut = apiClient.put as jest.MockedFunction<typeof apiClient.put>;
const mockedCreateUploadTask = FileSystem.createUploadTask as jest.MockedFunction<
  typeof FileSystem.createUploadTask
>;

beforeEach(() => {
  jest.clearAllMocks();
  useUploadStore.setState({ items: {} });
});

describe('runItem — chọn đúng phương thức PUT', () => {
  it('PRESIGNED_PUT tải qua expo-file-system, KHÔNG gọi apiClient.put', async () => {
    const localId = 'local-presigned';
    seedItem(localId);
    mockedPost
      .mockResolvedValueOnce({
        data: {
          asset: baseAsset({ id: 'asset-p' }),
          upload: { method: 'PRESIGNED_PUT', url: 'https://s3/x', headers: {}, expiresAt: '' },
        },
      } as never)
      .mockResolvedValueOnce({ data: baseAsset({ id: 'asset-p', status: 'READY' }) } as never);
    mockedCreateUploadTask.mockReturnValue({
      uploadAsync: jest.fn().mockResolvedValue({ status: 200, headers: {}, mimeType: null, body: '' }),
      cancelAsync: jest.fn(),
    } as never);

    await runItem(localId, () => true);

    expect(mockedCreateUploadTask).toHaveBeenCalledTimes(1);
    expect(mockedPut).not.toHaveBeenCalled();
    expect(mockedPost.mock.calls.some(([path]) => String(path).includes('/complete'))).toBe(true); // PRESIGNED vẫn phải `complete`
    expect(statusOf(localId)).toBe('ready');
  });

  it('API_PUT tải qua apiClient.put, KHÔNG gọi expo-file-system', async () => {
    const localId = 'local-apiput';
    seedItem(localId);
    mockedPost.mockResolvedValueOnce({
      data: {
        asset: baseAsset({ id: 'asset-a' }),
        upload: { method: 'API_PUT', url: '/assets/asset-a/content' },
      },
    } as never);
    mockedPut.mockResolvedValue({ data: { data: baseAsset({ id: 'asset-a', status: 'READY' }) } } as never);

    await runItem(localId, () => true);

    expect(mockedPut).toHaveBeenCalledTimes(1);
    expect(mockedCreateUploadTask).not.toHaveBeenCalled();
    expect(statusOf(localId)).toBe('ready');
  });
});

describe('PUT → PROCESSING → poll READY', () => {
  it('poll GET /assets/:id với backoff 0.5s/1s tới khi READY', async () => {
    jest.useFakeTimers();
    const localId = 'local-poll';
    seedItem(localId);
    mockedPost.mockResolvedValueOnce({
      data: {
        asset: baseAsset({ id: 'asset-poll' }),
        upload: { method: 'API_PUT', url: '/assets/asset-poll/content' },
      },
    } as never);
    mockedPut.mockResolvedValue({ data: { data: baseAsset({ id: 'asset-poll', status: 'PROCESSING' }) } } as never);
    mockedGet
      .mockResolvedValueOnce({ data: baseAsset({ id: 'asset-poll', status: 'PROCESSING' }) } as never)
      .mockResolvedValueOnce({ data: baseAsset({ id: 'asset-poll', status: 'READY' }) } as never);

    const runPromise = runItem(localId, () => true);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(500);
    await runPromise;

    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(statusOf(localId)).toBe('ready');
    jest.useRealTimers();
  });
});
