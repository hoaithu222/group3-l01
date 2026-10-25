import { renderHook } from '@testing-library/react-native';

import { useUploadStore } from '@/core/uploads/upload.store';

import { resourcesService } from '../api/resources.service';
import { useUploadToFolder } from '../hooks/useUploadToFolder';
import { retryFinalize, startResourceUploadFinalizer } from '../store/resource-upload-finalizer';
import { useResourceUploadStore } from '../store/resource-uploads.store';
import { makeResource } from './fixtures';
import { file, flush, only, run } from './upload-helpers';

/** Thử lại CHỈ bước tạo Resource, và chống gọi đôi khi đang `creating` (Idempotency-Key cố định/tệp). */

jest.mock('../api/resources.service', () => ({
  MIN_SEARCH_LENGTH: 2,
  resourcesService: { create: jest.fn() },
}));
jest.mock('@/core/uploads/upload.runner', () => ({
  cancelUpload: jest.fn(),
  cancelUploadsByScope: jest.fn((scope: string, scopeKey?: string) => {
    const { useUploadStore: store } = jest.requireActual('@/core/uploads/upload.store');
    store.getState().cancelByScope(scope, scopeKey);
  }),
  retryUpload: jest.fn(),
}));

const mockedCreate = jest.mocked(resourcesService.create);

beforeAll(() => startResourceUploadFinalizer());

beforeEach(() => {
  jest.clearAllMocks();
  useUploadStore.getState().clear();
  useResourceUploadStore.getState().reset();
});

describe('finalizer — thử lại và chống gọi đôi', () => {
  async function enqueue(folderId: string | null) {
    const { result } = await renderHook(() => useUploadToFolder('ws-1', folderId));
    await run(() => {
      result.current.enqueue([file()]);
    });
    return only(Object.values(useUploadStore.getState().items)).localId;
  }

  it('tạo lỗi RSC_003 ⇒ "failed" giữ mã; thử lại chỉ bước tạo, cùng Idempotency-Key, không tạo đôi khi đã xong', async () => {
    mockedCreate.mockRejectedValueOnce(
      Object.assign(new Error('400'), {
        isAxiosError: true,
        response: { data: { error: { code: 'RSC_003' } }, status: 400 },
      }),
    );
    const localId = await enqueue('fld-9');
    await run(() =>
      useUploadStore.getState().updateItem(localId, { assetId: 'asset-1', status: 'ready' }),
    );
    await flush();

    expect(useResourceUploadStore.getState().targets[localId]).toMatchObject({
      errorCode: 'RSC_003',
      phase: 'failed',
    });

    mockedCreate.mockResolvedValueOnce(makeResource());
    await run(() => retryFinalize(localId));
    await flush();

    expect(mockedCreate).toHaveBeenCalledTimes(2);
    expect(mockedCreate.mock.calls[1]?.[2]).toBe(`rsc-${localId}`);
    expect(useResourceUploadStore.getState().targets[localId]?.phase).toBe('created');
  });

  it('cập nhật tiến độ nhiều lần khi đang creating KHÔNG gọi tạo lần hai', async () => {
    let resolveCreate: (value: ReturnType<typeof makeResource>) => void = () => undefined;
    mockedCreate.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));
    const localId = await enqueue('fld-9');

    await run(() =>
      useUploadStore.getState().updateItem(localId, { assetId: 'asset-1', status: 'ready' }),
    );
    await run(() => useUploadStore.getState().updateItem(localId, { progress: 100 }));
    await run(() => useUploadStore.getState().updateItem(localId, { progress: 100 }));
    expect(mockedCreate).toHaveBeenCalledTimes(1);

    resolveCreate(makeResource());
    await flush();
  });
});
