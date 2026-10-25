import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';

import { useUploadStore } from '@/core/uploads/upload.store';

import { useResourcesScope } from '../hooks/useResourcesScope';
import { resourceKeys } from '../queries/resources.keys';
import { useResourceUploadStore } from '../store/resource-uploads.store';
import { makeResource } from './fixtures';
import { makeQueryClient } from './render-helpers';
import { run } from './upload-helpers';

/** `permission:revoked` (app.md p3-01 §5, §8): dọn cache + huỷ hàng đợi tải lên của workspace. */

jest.mock('@/core/uploads/upload.runner', () => ({
  cancelUpload: jest.fn(),
  cancelUploadsByScope: jest.fn((scope: string, scopeKey?: string) => {
    const { useUploadStore: store } = jest.requireActual('@/core/uploads/upload.store');
    store.getState().cancelByScope(scope, scopeKey);
  }),
  retryUpload: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  useUploadStore.getState().clear();
  useResourceUploadStore.getState().reset();
});

describe('permission:revoked (workspace) — dọn cache và huỷ hàng đợi', () => {
  interface MockSocket {
    __emitServer: (event: string, payload?: unknown) => void;
  }
  const socket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

  it('xoá cache resources của ĐÚNG workspace, huỷ upload của nó; workspace khác giữ nguyên', async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(resourceKeys.folder('ws-1', 'root'), { breadcrumb: [], children: [] });
    queryClient.setQueryData(resourceKeys.storage('ws-1'), { usedBytes: 1 });
    queryClient.setQueryData(
      resourceKeys.detail('r-1'),
      makeResource({ id: 'r-1', workspaceId: 'ws-1' }),
    );
    queryClient.setQueryData(resourceKeys.folder('ws-2', 'root'), { breadcrumb: [], children: [] });

    const upload = (localId: string, wsId: string) =>
      useUploadStore.getState().addItem({
        kind: 'FILE',
        localId,
        mime: 'application/pdf',
        name: `${localId}.pdf`,
        progress: 30,
        scope: 'RESOURCE',
        scopeKey: wsId,
        size: 10,
        status: 'uploading',
        uri: 'file:///x',
        workspaceId: wsId,
      });
    upload('u1', 'ws-1');
    upload('u2', 'ws-2');
    useResourceUploadStore.getState().setTarget('u1', {
      folderId: null,
      idempotencyKey: 'k1',
      phase: 'awaiting',
      workspaceId: 'ws-1',
    });
    useResourceUploadStore.getState().setTarget('u2', {
      folderId: null,
      idempotencyKey: 'k2',
      phase: 'awaiting',
      workspaceId: 'ws-2',
    });

    await renderHook(() => useResourcesScope('ws-1'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    await run(() =>
      socket.__emitServer('permission:revoked', {
        cascade: true,
        reason: 'REMOVED',
        scopeId: 'ws-1',
        scopeType: 'WORKSPACE',
        v: 1,
        version: 2,
      }),
    );

    expect(queryClient.getQueryData(resourceKeys.folder('ws-1', 'root'))).toBeUndefined();
    expect(queryClient.getQueryData(resourceKeys.storage('ws-1'))).toBeUndefined();
    expect(queryClient.getQueryData(resourceKeys.detail('r-1'))).toBeUndefined();
    expect(queryClient.getQueryData(resourceKeys.folder('ws-2', 'root'))).toBeDefined();
    expect(useUploadStore.getState().items.u1).toBeUndefined();
    expect(useUploadStore.getState().items.u2).toBeDefined();
    expect(useResourceUploadStore.getState().targets.u1).toBeUndefined();
    expect(useResourceUploadStore.getState().targets.u2).toBeDefined();
  });

  it('scope khác (kênh) hay workspace khác ⇒ không đụng gì', async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(resourceKeys.folder('ws-1', 'root'), { breadcrumb: [], children: [] });

    await renderHook(() => useResourcesScope('ws-1'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    await run(() =>
      socket.__emitServer('permission:revoked', {
        cascade: false,
        reason: 'REMOVED',
        scopeId: 'ch-1',
        scopeType: 'CHANNEL',
        v: 1,
        version: 2,
      }),
    );
    await run(() =>
      socket.__emitServer('permission:revoked', {
        cascade: true,
        reason: 'REMOVED',
        scopeId: 'ws-9',
        scopeType: 'WORKSPACE',
        v: 1,
        version: 2,
      }),
    );

    expect(queryClient.getQueryData(resourceKeys.folder('ws-1', 'root'))).toBeDefined();
  });
});

describe('resource:changed (P1) — làm cũ danh sách của đúng workspace', () => {
  interface MockSocket {
    __emitServer: (event: string, payload?: unknown) => void;
  }
  const socket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

  function arrange() {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(resourceKeys.folder('ws-1', 'root'), { breadcrumb: [], children: [] });
    queryClient.setQueryData(resourceKeys.trash('ws-1'), { folders: [], resources: [] });
    queryClient.setQueryData(resourceKeys.folder('ws-2', 'root'), { breadcrumb: [], children: [] });
    queryClient.setQueryData(resourceKeys.detail('r-1'), makeResource({ id: 'r-1' }));
    return queryClient;
  }

  async function mount(queryClient: ReturnType<typeof makeQueryClient>) {
    await renderHook(() => useResourcesScope('ws-1'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
  }

  it('sự kiện của workspace đang mở ⇒ làm cũ folder/trash + chi tiết tệp; KHÔNG xoá dữ liệu', async () => {
    const queryClient = arrange();
    await mount(queryClient);

    await run(() =>
      socket.__emitServer('resource:changed', {
        action: 'UPDATED',
        folderId: null,
        kind: 'RESOURCE',
        subjectId: 'r-1',
        workspaceId: 'ws-1',
      }),
    );

    expect(queryClient.getQueryState(resourceKeys.folder('ws-1', 'root'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(resourceKeys.trash('ws-1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(resourceKeys.detail('r-1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(resourceKeys.folder('ws-1', 'root'))).toBeDefined();
  });

  it('sự kiện của workspace khác ⇒ không đụng gì', async () => {
    const queryClient = arrange();
    await mount(queryClient);

    await run(() =>
      socket.__emitServer('resource:changed', {
        action: 'CREATED',
        folderId: null,
        kind: 'FOLDER',
        subjectId: 'f-9',
        workspaceId: 'ws-2',
      }),
    );

    expect(queryClient.getQueryState(resourceKeys.folder('ws-1', 'root'))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(resourceKeys.detail('r-1'))?.isInvalidated).toBe(false);
  });
});
