import { apiClient } from '@/core/api';

import { runItem } from '../upload.pipeline';
import { useUploadStore } from '../upload.store';

import { baseAsset, seedItem, statusOf } from './fixtures';

/**
 * `API_PUT` (Local/Cloudinary — đúng cấu hình Railway `STORAGE_TYPE=cloudinary`): BE TỰ CHỐT asset ngay trong
 * `PUT /assets/:id/content` (`AssetService.uploadContent` → `finalize`: `PROCESSING`, ảnh nhỏ → `READY`). Gọi thêm
 * `POST /assets/:id/complete` sau đó là 403 `ASSET_004` (asset không còn `UPLOADING`) — lỗi từng làm HỎNG MỌI ảnh/tệp/tin thoại
 * mà test pipeline cũ không thấy vì nó mock `PUT` trả `{}` và mong đợi hai lệnh POST. Mock ở biên I/O (`apiClient`), chạy logic thật.
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

beforeEach(() => {
  jest.resetAllMocks(); // dọn cả hàng đợi `mockResolvedValueOnce` còn sót giữa các ca
  useUploadStore.setState({ items: {} });
});

describe('API_PUT — BE đã chốt asset trong PUT /content', () => {
  it('KHÔNG gọi POST /assets/:id/complete (BE trả 403 ASSET_004)', async () => {
    const localId = 'local-apiput-no-complete';
    seedItem(localId);
    mockedPost.mockResolvedValueOnce({
      data: {
        asset: baseAsset({ id: 'asset-b' }),
        upload: { method: 'API_PUT', url: '/assets/asset-b/content' },
      },
    } as never);
    mockedPut.mockResolvedValue({ data: { data: baseAsset({ id: 'asset-b', status: 'READY' }) } } as never);

    await runItem(localId, () => true);

    // Chỉ MỘT lệnh POST (tạo asset) — không có `/complete` sau `PUT /content`.
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls.some(([path]) => String(path).includes('/complete'))).toBe(false);
    expect(statusOf(localId)).toBe('ready');
  });

  it('BE từ chối nội dung (REJECTED) ⇒ item failed kèm lý do', async () => {
    const localId = 'local-apiput-rejected';
    seedItem(localId);
    mockedPost.mockResolvedValueOnce({
      data: { asset: baseAsset({ id: 'asset-r' }), upload: { method: 'API_PUT', url: '/assets/asset-r/content' } },
    } as never);
    mockedPut.mockResolvedValue({
      data: { data: baseAsset({ id: 'asset-r', status: 'REJECTED', rejectReason: 'Nội dung tệp không khớp loại khai báo' }) },
    } as never);

    await runItem(localId, () => true);

    expect(statusOf(localId)).toBe('failed');
    expect(useUploadStore.getState().items[localId]?.errorCode).toBe('Nội dung tệp không khớp loại khai báo');
  });
});

describe('runItem — thử lại asset đã tạo', () => {
  it('asset còn UPLOADING ⇒ xin URL mới rồi tải lại', async () => {
    const localId = 'local-retry-uploading';
    seedItem(localId);
    useUploadStore.getState().updateItem(localId, { assetId: 'asset-u', status: 'queued' });
    mockedGet.mockResolvedValueOnce({ data: baseAsset({ id: 'asset-u', status: 'UPLOADING' }) } as never);
    mockedPost.mockResolvedValueOnce({ data: { method: 'API_PUT', url: '/assets/asset-u/content' } } as never);
    mockedPut.mockResolvedValue({ data: { data: baseAsset({ id: 'asset-u', status: 'READY' }) } } as never);

    await runItem(localId, () => true);

    expect(mockedPost).toHaveBeenCalledTimes(1); // chỉ `upload-url`
    expect(mockedPut).toHaveBeenCalledTimes(1);
    expect(statusOf(localId)).toBe('ready');
  });

  it('asset ĐÃ được BE chốt ở lượt trước (mất phản hồi) ⇒ KHÔNG xin URL mới/tải lại, đi thẳng tới kết quả', async () => {
    const localId = 'local-retry-settled';
    seedItem(localId);
    useUploadStore.getState().updateItem(localId, { assetId: 'asset-s', status: 'queued' });
    mockedGet.mockResolvedValueOnce({ data: baseAsset({ id: 'asset-s', status: 'READY' }) } as never);

    await runItem(localId, () => true);

    expect(mockedPost).not.toHaveBeenCalled();
    expect(mockedPut).not.toHaveBeenCalled();
    expect(statusOf(localId)).toBe('ready');
  });
});
