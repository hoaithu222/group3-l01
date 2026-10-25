import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { compressImage } from '@/core/media/compress-image';
import { pickImages } from '@/core/media/pick-media';
import { useUploadStore } from '@/core/uploads/upload.store';
import { showToast } from '@/shared/utils/toast.utils';

import { studyService } from '../api/study.service';
import { SetEditorScreen } from '../screens/SetEditorScreen';
import { useSetEditorStore } from '../store/set-editor.store';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Ảnh/âm thanh trong trình soạn (p4-01 app.md §4 "Upload media"): chọn → (nén ảnh) → hàng đợi upload scope `STUDY` theo Ô →
 * đang tải thì KHOÁ Lưu → READY thì ghi vào ĐÚNG mục → `PUT items` mang `frontMediaAssetId`/`audioAssetId`/`options[].mediaAssetId`.
 * Runner upload bị mock (không có mạng) — test tự đẩy trạng thái `ready`/`failed` vào store như pipeline thật sẽ làm.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ setId: 's1' }),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'connected' }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: () => ({ isTablet: false, tier: 'phone', width: 375 }),
}));
jest.mock('../api/study.service', () => ({
  studyService: { get: jest.fn(), items: jest.fn(), putItems: jest.fn() },
}));
jest.mock('@/core/media/pick-media', () => ({ pickAudio: jest.fn(), pickImages: jest.fn() }));
jest.mock('@/core/media/compress-image', () => ({ compressImage: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@/core/uploads/upload.runner', () => ({ cancelUpload: jest.fn(), retryUpload: jest.fn() }));
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({ data: { url: 'https://cdn.example/x.jpg' }, isPending: false, refetch: jest.fn() }),
}));
// Mock toàn cục `__mocks__/expo-audio` chỉ có phần GHI ÂM (`@/shared/ui/attachment` kéo `use-voice-recorder` theo) — thêm phần PHÁT.
jest.mock('expo-audio', () => ({
  ...jest.requireActual('../../../../__mocks__/expo-audio'),
  useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), replace: jest.fn() }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 0, playing: false }),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const mocked = jest.mocked(studyService);
const MIB = 1024 * 1024;

beforeEach(() => {
  jest.clearAllMocks();
  useSetEditorStore.getState().reset();
  useUploadStore.getState().clear();
  mocked.get.mockResolvedValue(makeSet());
  mocked.items.mockResolvedValue({
    items: [makeItem({ id: 'i1', order: 1 }), makeChoiceItem({ id: 'i2', order: 2 })],
    setVersion: 3,
  });
  mocked.putItems.mockResolvedValue({ idMap: [], itemCount: 2, version: 4 });
  jest.mocked(pickImages).mockResolvedValue([
    { height: 3000, kind: 'IMAGE', mime: 'image/heic', name: 'IMG_1.HEIC', size: 9 * MIB, uri: 'file:///pick.heic', width: 4000 },
  ]);
  jest.mocked(compressImage).mockResolvedValue({ height: 1536, uri: 'file:///pick.jpg', width: 2048 });
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, modificationTime: 0, size: 800_000, uri: '' });
});

const uploads = () => Object.values(useUploadStore.getState().items);
const openItem1 = async () => fireEvent.press(await screen.findByLabelText(/^Mục 1, Thẻ ghi nhớ/));
const setUploadState = (localId: string, patch: Parameters<ReturnType<typeof useUploadStore.getState>['updateItem']>[1]) =>
  act(async () => useUploadStore.getState().updateItem(localId, patch));

describe('ảnh mặt trước', () => {
  it('nén ra JPEG, xếp hàng upload STUDY theo ô; đang tải khoá Lưu; READY ghi vào mục và đi trong PUT', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await openItem1();

    await fireEvent.press(await screen.findByLabelText('Thêm ảnh: Ảnh mặt trước'));

    await waitFor(() => expect(uploads()).toHaveLength(1));
    const [upload] = uploads();
    // HEIC 9 MB không qua được trần 5 MB của scope STUDY — phải qua `compressImage` (đổi sang JPEG).
    expect(compressImage).toHaveBeenCalledWith({ height: 3000, uri: 'file:///pick.heic', width: 4000 });
    expect(upload).toMatchObject({
      kind: 'IMAGE',
      mime: 'image/jpeg',
      name: 'IMG_1.jpg',
      scope: 'STUDY',
      scopeKey: 'study-item:s1:i1:front',
      size: 800_000,
      status: 'queued',
      uri: 'file:///pick.jpg',
    });

    // Đang tải: nói rõ và khoá Lưu (asset chưa READY thì BE trả STUDY_006).
    expect(await screen.findByText(/Đang tải 1 tệp lên/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
    expect(screen.getByText('Đã lưu')).toBeOnTheScreen();

    await setUploadState(upload?.localId ?? '', { assetId: 'asset-new', status: 'ready' });

    expect(await screen.findByText('1 thay đổi chưa lưu')).toBeOnTheScreen();
    expect(uploads()).toHaveLength(0);
    expect(screen.queryByText(/Đang tải/)).toBeNull();

    await fireEvent.press(screen.getByText('Lưu'));
    await waitFor(() => expect(mocked.putItems).toHaveBeenCalledTimes(1));
    const [, payload] = mocked.putItems.mock.calls[0] ?? [];
    expect(payload?.upsert).toHaveLength(1);
    expect(payload?.upsert[0]).toMatchObject({ clientItemKey: 'i1', frontMediaAssetId: 'asset-new' });
  });

  it('tệp xong SAU khi đóng form mục vẫn ghi đúng vào mục (màn soạn giữ, không phải ô)', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await openItem1();
    await fireEvent.press(await screen.findByLabelText('Thêm ảnh: Ảnh mặt trước'));
    await waitFor(() => expect(uploads()).toHaveLength(1));

    await fireEvent.press(screen.getByText('Xong')); // về danh sách — ô ảnh unmount
    await setUploadState(uploads()[0]?.localId ?? '', { assetId: 'asset-late', status: 'ready' });

    expect(await screen.findByText('1 thay đổi chưa lưu')).toBeOnTheScreen();
    expect(useSetEditorStore.getState().drafts.s1?.items.i1?.frontMediaAssetId).toBe('asset-late');
  });

  it('tải LỖI khoá Lưu và nói rõ; "Bỏ tệp này" gỡ tệp và mở khoá', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await openItem1();
    await fireEvent.press(await screen.findByLabelText('Thêm ảnh: Ảnh mặt trước'));
    await waitFor(() => expect(uploads()).toHaveLength(1));

    await setUploadState(uploads()[0]?.localId ?? '', { errorCode: 'ASSET_002', status: 'failed' });

    expect(await screen.findByText(/1 tệp tải lỗi/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Bỏ tệp tải lỗi: Ảnh mặt trước'));
    await waitFor(() => expect(screen.queryByText(/tải lỗi/)).toBeNull());
    expect(uploads()).toHaveLength(0);
  });

  it('ảnh lớn hơn 5 MB kể cả sau khi nén ⇒ toast, KHÔNG xếp hàng', async () => {
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, modificationTime: 0, size: 6 * MIB, uri: '' });
    await renderWithProviders(<SetEditorScreen />);
    await openItem1();

    await fireEvent.press(await screen.findByLabelText('Thêm ảnh: Ảnh mặt trước'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.stringMatching(/quá lớn/)));
    expect(uploads()).toHaveLength(0);
  });

  it('trình chọn/nén NÉM lỗi ⇒ toast, không Promise reject vô chủ', async () => {
    jest.mocked(compressImage).mockRejectedValueOnce(new Error('hỏng'));
    await renderWithProviders(<SetEditorScreen />);
    await openItem1();

    await fireEvent.press(await screen.findByLabelText('Thêm ảnh: Ảnh mặt trước'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', 'Không mở được thư viện ảnh. Hãy thử lại.'));
  });
});
