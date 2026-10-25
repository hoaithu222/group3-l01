import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';

import { compressImage } from '@/core/media/compress-image';
import { pickAudio, pickImages } from '@/core/media/pick-media';
import { cancelUpload } from '@/core/uploads/upload.runner';
import { useUploadStore } from '@/core/uploads/upload.store';
import { showToast } from '@/shared/utils/toast.utils';

import { studyService } from '../api/study.service';
import { SetEditorScreen } from '../screens/SetEditorScreen';
import { useSetEditorStore } from '../store/set-editor.store';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Âm thanh, ảnh từng lựa chọn và media SẴN CÓ trong trình soạn (phần ảnh mặt trước: `SetEditorScreen.media.test.tsx`). Runner
 * upload bị mock — test tự đẩy trạng thái `ready` vào store như pipeline thật sẽ làm.
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

describe('âm thanh', () => {
  it('MIME máy báo (audio/x-m4a) được quy về audio/mp4 mà BE nhận; tệp vào ô âm thanh của đúng mục', async () => {
    jest.mocked(pickAudio).mockResolvedValue({ kind: 'AUDIO', mime: 'audio/x-m4a', name: 'phat-am.m4a', size: 2 * MIB, uri: 'file:///a.m4a' });
    await renderWithProviders(<SetEditorScreen />);
    await openItem1();

    await fireEvent.press(await screen.findByLabelText('Thêm âm thanh: Âm thanh'));

    await waitFor(() => expect(uploads()).toHaveLength(1));
    expect(uploads()[0]).toMatchObject({
      kind: 'AUDIO',
      mime: 'audio/mp4',
      scope: 'STUDY',
      scopeKey: 'study-item:s1:i1:audio',
      size: 2 * MIB,
    });
    await setUploadState(uploads()[0]?.localId ?? '', { assetId: 'audio-1', status: 'ready' });
    await waitFor(() => expect(useSetEditorStore.getState().drafts.s1?.items.i1?.audioAssetId).toBe('audio-1'));
    // Đã có âm thanh ⇒ ô hiện nút nghe thử (không tự phát) + Đổi/Xoá.
    expect(await screen.findByLabelText('Âm thanh')).toBeOnTheScreen();
    expect(screen.getByLabelText('Xoá âm thanh: Âm thanh')).toBeOnTheScreen();
  });

  it.each([
    ['audio/wav', 'a.wav', 2 * MIB, /MP3 hoặc M4A/],
    ['audio/mpeg', 'a.mp3', 11 * MIB, /quá lớn/],
  ])('%s %s (%d byte) bị chặn ở máy trước khi tạo asset', async (mime, name, size, message) => {
    jest.mocked(pickAudio).mockResolvedValue({ kind: 'AUDIO', mime, name, size, uri: 'file:///a' });
    await renderWithProviders(<SetEditorScreen />);
    await openItem1();

    await fireEvent.press(await screen.findByLabelText('Thêm âm thanh: Âm thanh'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.stringMatching(message)));
    expect(uploads()).toHaveLength(0);
  });
});

describe('ảnh lựa chọn và media sẵn có', () => {
  async function openItem2() {
    await fireEvent.press(await screen.findByLabelText(/^Mục 2, Trắc nghiệm/));
  }

  it('lựa chọn đã có ảnh hiện xem trước; "Xoá ảnh" gỡ ĐÚNG lựa chọn đó và PUT gửi mediaAssetId: null', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await openItem2();

    expect(await screen.findByRole('imagebutton', { name: 'Ảnh lựa chọn 2' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Thêm ảnh: Ảnh lựa chọn 1')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Xoá ảnh: Ảnh lựa chọn 2'));
    expect(await screen.findByText('1 thay đổi chưa lưu')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Lưu'));

    await waitFor(() => expect(mocked.putItems).toHaveBeenCalledTimes(1));
    const [, payload] = mocked.putItems.mock.calls[0] ?? [];
    const item = payload?.upsert[0];
    expect(item).toMatchObject({ clientItemKey: 'i2', type: 'MULTIPLE_CHOICE' });
    expect(item && 'options' in item ? item.options.map((o) => o.mediaAssetId) : []).toEqual([null, null]);
  });

  it('chỉ sửa chữ thì media sẵn có của lựa chọn được GIỮ NGUYÊN (BE ghi đè cả mục — bỏ là xoá ảnh)', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await openItem2();
    await fireEvent.changeText(await screen.findByDisplayValue('Thủ đô của Việt Nam?'), 'Thủ đô nước ta?');
    await fireEvent.press(screen.getByText('Lưu'));

    await waitFor(() => expect(mocked.putItems).toHaveBeenCalledTimes(1));
    const item = (mocked.putItems.mock.calls[0]?.[1])?.upsert[0];
    expect(item && 'options' in item ? item.options.map((o) => o.mediaAssetId) : []).toEqual([null, 'asset-1']);
  });
});

describe('rời trình soạn', () => {
  it('bỏ nháp ⇒ HUỶ tệp còn đang tải (không để chúng tải xong rồi ghi vào bộ mà nháp đã mất)', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await openItem1();
    await fireEvent.press(await screen.findByLabelText('Thêm ảnh: Ảnh mặt trước'));
    await waitFor(() => expect(uploads()).toHaveLength(1));
    const localId = uploads()[0]?.localId;

    await fireEvent.press(screen.getByLabelText('Quay lại')); // form → danh sách
    await fireEvent.press(screen.getByLabelText('Quay lại')); // danh sách → thoát (chưa có thay đổi nháp)

    expect(cancelUpload).toHaveBeenCalledWith(localId);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
