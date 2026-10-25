import { useUploadStore } from '../upload.store';
import type { AssetDto, UploadItem } from '../upload.types';

/** Dữ liệu giả dùng chung giữa `upload.pipeline.test.ts`/`upload.service.test.ts`. */
export function baseAsset(overrides: Partial<AssetDto> = {}): AssetDto {
  return {
    id: 'asset-1',
    scope: 'MESSAGE',
    kind: 'IMAGE',
    status: 'UPLOADING',
    mime: 'image/jpeg',
    size: null,
    originalName: 'a.jpg',
    width: null,
    height: null,
    durationMs: null,
    waveform: null,
    hasThumb: false,
    rejectReason: null,
    createdAt: new Date().toISOString(),
    readyAt: null,
    ...overrides,
  };
}

/** `noUncheckedIndexedAccess` (tsconfig.json) — truy cập `Record` trả `T | undefined`. */
export function statusOf(localId: string): UploadItem['status'] | undefined {
  return useUploadStore.getState().items[localId]?.status;
}

export function seedItem(localId: string): void {
  useUploadStore.getState().addItem({
    localId,
    scope: 'MESSAGE',
    kind: 'IMAGE',
    uri: 'file:///a.jpg',
    name: 'a.jpg',
    mime: 'image/jpeg',
    size: 1024,
    status: 'queued',
    progress: 0,
  } satisfies UploadItem);
}
