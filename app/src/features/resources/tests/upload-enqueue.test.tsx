import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useUploadStore } from '@/core/uploads/upload.store';

import { resourcesService } from '../api/resources.service';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { useUploadToFolder } from '../hooks/useUploadToFolder';
import { startResourceUploadFinalizer } from '../store/resource-upload-finalizer';
import { useResourceUploadStore } from '../store/resource-uploads.store';
import { makeResource } from './fixtures';
import { makeQueryClient } from './render-helpers';
import { file, flush, only, run } from './upload-helpers';

/**
 * Xếp hàng → thêm vào kho (README p3-01 ST-01, app.md §8):
 *  · xếp hàng ghi scope RESOURCE + workspaceId + đích;
 *  · asset READY ⇒ `POST resources` đúng thư mục đã ghi lúc xếp hàng;
 *  · REJECTED ⇒ KHÔNG gọi tạo, hiện lý do.
 * `core/uploads/upload.runner` được mock (test chỉ chạm store) nên không có gì thật sự tải.
 */

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

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>;
}

describe('useUploadToFolder — xếp hàng', () => {
  it('ghi scope RESOURCE + workspaceId + đích; chuẩn hoá MIME mã nguồn; loại tệp rỗng', async () => {
    const { result } = await renderHook(() => useUploadToFolder('ws-1', 'fld-9'));

    let plan!: ReturnType<typeof result.current.enqueue>;
    await run(() => {
      plan = result.current.enqueue([
        file({ mime: 'video/mp2t', name: 'app.ts' }),
        file({ name: 'rong.pdf', size: 0 }),
      ]);
    });

    expect(plan.rejected.map((r) => r.name)).toEqual(['rong.pdf']);
    const queued = only(Object.values(useUploadStore.getState().items));
    expect(queued).toMatchObject({
      mime: 'text/plain',
      scope: 'RESOURCE',
      scopeKey: 'ws-1',
      status: 'queued',
      workspaceId: 'ws-1',
    });
    expect(useResourceUploadStore.getState().targets[queued.localId]).toMatchObject({
      folderId: 'fld-9',
      phase: 'awaiting',
      workspaceId: 'ws-1',
    });
  });
});

describe('finalizer — asset READY → POST /resources', () => {
  async function enqueue(folderId: string | null) {
    const { result } = await renderHook(() => useUploadToFolder('ws-1', folderId));
    await run(() => {
      result.current.enqueue([file()]);
    });
    return only(Object.values(useUploadStore.getState().items)).localId;
  }

  it('READY ⇒ gọi tạo ĐÚNG folderId đã ghi lúc xếp hàng, với Idempotency-Key cố định, rồi "created"', async () => {
    mockedCreate.mockResolvedValue(makeResource({ id: 'new', folderId: 'fld-9' }));
    const localId = await enqueue('fld-9');

    await run(() =>
      useUploadStore.getState().updateItem(localId, { assetId: 'asset-1', status: 'ready' }),
    );
    await flush();

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedCreate).toHaveBeenCalledWith(
      'ws-1',
      { assetId: 'asset-1', folderId: 'fld-9' },
      `rsc-${localId}`,
    );
    expect(useResourceUploadStore.getState().targets[localId]).toMatchObject({
      phase: 'created',
      resourceId: 'new',
    });
  });

  it('thư mục gốc ⇒ KHÔNG gửi folderId', async () => {
    mockedCreate.mockResolvedValue(makeResource());
    const localId = await enqueue(null);

    await run(() =>
      useUploadStore.getState().updateItem(localId, { assetId: 'asset-1', status: 'ready' }),
    );
    await flush();

    expect(mockedCreate).toHaveBeenCalledWith('ws-1', { assetId: 'asset-1' }, expect.any(String));
  });

  it('REJECTED/failed ⇒ KHÔNG gọi tạo; dòng hàng đợi hiện lý do', async () => {
    const localId = await enqueue('fld-9');
    await run(() =>
      useUploadStore
        .getState()
        .updateItem(localId, { assetId: 'asset-1', errorCode: 'ASSET_001', status: 'failed' }),
    );
    await flush();

    expect(mockedCreate).not.toHaveBeenCalled();
    const { result } = await renderHook(() => useUploadQueue('ws-1'), { wrapper: Wrapper });
    expect(only(result.current.rows)).toMatchObject({
      reason: 'Định dạng không hỗ trợ',
      retry: 'upload',
      state: 'failed',
    });
  });
});
