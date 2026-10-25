import { runItem } from '../upload.pipeline';
import { __setOnlineForTests, cancelUpload } from '../upload.runner';
import { uploadService } from '../upload.service';
import { useUploadStore } from '../upload.store';
import type { UploadItem } from '../upload.types';

/**
 * `upload.runner.ts` chỉ lo LỊCH (bao nhiêu song song, khi nào chạy tiếp) —
 * mock `runItem` (`upload.pipeline.ts`, việc CHẠY một item) để bài test này
 * chỉ khẳng định đúng phần lịch, không lặp lại việc `upload.service.test.ts`
 * đã kiểm (chọn PRESIGNED_PUT/API_PUT, poll).
 *
 * ⚠️ `jest.mock(...)` được BABEL HOIST lên đầu file lúc biên dịch (bất kể viết
 * ở đâu trong file), nên đặt SAU `import` vẫn nhận đúng bản giả — thứ tự vật
 * lý ở đây chỉ để ESLint (`import/first`) khỏi phàn nàn.
 */
jest.mock('../upload.pipeline', () => ({ runItem: jest.fn() }));
jest.mock('../upload.service', () => ({ uploadService: { abortAsset: jest.fn(async () => undefined) } }));

const mockedRunItem = runItem as jest.MockedFunction<typeof runItem>;
const mockedAbort = uploadService.abortAsset as jest.MockedFunction<typeof uploadService.abortAsset>;

/** Chờ hàng đợi microtask rỗng — đủ cho các `await Promise.resolve()`/`.then()` bên trong `drain()`/mock chạy xong. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** `tsconfig.json` bật `noUncheckedIndexedAccess` — truy cập `Record` trả `T | undefined`, hàm này khẳng định item PHẢI có (test tự seed trước). */
function statusOf(localId: string): UploadItem['status'] {
  const item = useUploadStore.getState().items[localId];
  if (!item) throw new Error(`Test seed thiếu item ${localId}`);
  return item.status;
}

function seedItem(localId: string, overrides: Partial<UploadItem> = {}): void {
  useUploadStore.getState().addItem({
    localId,
    scope: 'MESSAGE',
    kind: 'IMAGE',
    uri: `file:///${localId}.jpg`,
    name: `${localId}.jpg`,
    mime: 'image/jpeg',
    size: 1024,
    status: 'queued',
    progress: 0,
    ...overrides,
  });
}

/** Bản giả tối thiểu: đánh dấu 'uploading' NGAY (đồng bộ, giống pha đầu của `runItem` thật) rồi treo tới khi test cho hoàn tất. */
function mockRunItemAsQueue(): Record<string, () => void> {
  const resolvers: Record<string, () => void> = {};
  mockedRunItem.mockImplementation(async (localId: string) => {
    useUploadStore.getState().updateItem(localId, { status: 'uploading' });
    await new Promise<void>((resolve) => {
      resolvers[localId] = resolve;
    });
    useUploadStore.getState().updateItem(localId, { status: 'ready' });
  });
  return resolvers;
}

beforeEach(() => {
  jest.clearAllMocks();
  useUploadStore.setState({ items: {} });
  __setOnlineForTests(true);
});

describe('drain — tối đa 2 song song', () => {
  it('3 tệp trong hàng đợi → chỉ 2 chạy cùng lúc, tệp thứ 3 chờ tới khi có chỗ trống', async () => {
    const resolvers = mockRunItemAsQueue();
    seedItem('a');
    seedItem('b');
    seedItem('c');

    await flush();

    expect(mockedRunItem).toHaveBeenCalledTimes(2);
    expect(statusOf('a')).toBe('uploading');
    expect(statusOf('b')).toBe('uploading');
    expect(statusOf('c')).toBe('queued');

    resolvers.a?.();
    await flush();

    expect(mockedRunItem).toHaveBeenCalledTimes(3);
    expect(statusOf('a')).toBe('ready');
    expect(statusOf('c')).toBe('uploading');
  });
});

describe('offline — tạm dừng và tự tiếp tục', () => {
  it('mất mạng chuyển item queued sang paused, có mạng lại thì tiếp tục', async () => {
    mockRunItemAsQueue();
    __setOnlineForTests(false);
    seedItem('a');
    await flush();

    expect(statusOf('a')).toBe('paused');
    expect(mockedRunItem).not.toHaveBeenCalled();

    __setOnlineForTests(true);
    await flush();

    expect(statusOf('a')).toBe('uploading');
    expect(mockedRunItem).toHaveBeenCalledWith('a', expect.any(Function));
  });
});

describe('cancelUpload', () => {
  it('huỷ item đã có assetId → gọi abortAsset, đặt trạng thái cancelled', () => {
    seedItem('a', { assetId: 'asset-a', status: 'uploading' });

    cancelUpload('a');

    expect(statusOf('a')).toBe('cancelled');
    expect(mockedAbort).toHaveBeenCalledWith('asset-a');
  });

  it('huỷ item CHƯA có assetId (còn queued) → KHÔNG gọi abortAsset', () => {
    seedItem('a');

    cancelUpload('a');

    expect(statusOf('a')).toBe('cancelled');
    expect(mockedAbort).not.toHaveBeenCalled();
  });

  it('huỷ LẦN HAI trên item đã `cancelled` → không bắn abort thêm (server trả 403 ASSET_004 mỗi lần)', () => {
    seedItem('a', { assetId: 'asset-a', status: 'uploading' });

    cancelUpload('a');
    cancelUpload('a');
    cancelUpload('a');

    expect(mockedAbort).toHaveBeenCalledTimes(1);
    expect(statusOf('a')).toBe('cancelled');
  });
});
