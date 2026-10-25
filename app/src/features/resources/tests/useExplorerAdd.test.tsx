import { act, renderHook } from '@testing-library/react-native';

import { pickDocuments, takePhoto } from '@/core/media/pick-media';
import { showToast } from '@/shared/utils/toast.utils';

import { useExplorerAdd } from '../hooks/useExplorerAdd';

/**
 * `void add.pick(key)` ở nút "+" không có `.catch`: trình chọn ném (không có camera, quyền bị thu hồi, picker bị hệ điều
 * hành đóng) mà hook không tự bắt thì thành Promise reject vô chủ — bản dev hiện thanh LogBox "Uncaught (in promise)" ở
 * đáy màn. Hook phải tự nuốt lỗi và báo bằng toast.
 */
jest.mock('@/core/media/pick-media', () => ({
  pickDocuments: jest.fn(),
  pickImages: jest.fn(),
  pickVideo: jest.fn(),
  takePhoto: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
const mockEnqueue = jest.fn(() => ({ rejected: [] }));
jest.mock('../hooks/useUploadToFolder', () => ({
  useUploadToFolder: () => ({ enqueue: mockEnqueue }),
}));
jest.mock('../queries/folder.queries', () => ({
  useCreateFolder: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));

beforeEach(() => jest.clearAllMocks());

describe('useExplorerAdd.pick — không để Promise reject vô chủ', () => {
  it('camera/trình chọn ném lỗi ⇒ pick() vẫn RESOLVE và báo toast', async () => {
    jest.mocked(takePhoto).mockRejectedValueOnce(new Error('Camera not available'));
    const { result } = await renderHook(() => useExplorerAdd({ folderId: 'root', wsId: 'ws-1' }));

    await expect(result.current.pick('camera')).resolves.toBeUndefined();

    expect(showToast).toHaveBeenCalledWith('error', 'Không mở được trình chọn tệp. Hãy thử lại.');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('chọn tài liệu bình thường ⇒ xếp hàng tải lên, không toast lỗi', async () => {
    jest.mocked(pickDocuments).mockResolvedValueOnce([
      { kind: 'DOCUMENT', mime: 'application/pdf', name: 'a.pdf', size: 10, uri: 'file:///a.pdf' },
    ] as never);
    const { result } = await renderHook(() => useExplorerAdd({ folderId: 'root', wsId: 'ws-1' }));

    await result.current.pick('documents');

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('"Tạo thư mục" chỉ mở tấm tên thư mục, không gọi trình chọn', async () => {
    const { result } = await renderHook(() => useExplorerAdd({ folderId: 'root', wsId: 'ws-1' }));

    await act(async () => {
      await result.current.pick('folder');
    });

    expect(result.current.folderSheetOpen).toBe(true);
    expect(pickDocuments).not.toHaveBeenCalled();
  });
});
