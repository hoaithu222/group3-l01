import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { compressImage } from '@/core/media/compress-image';
import { pickImages } from '@/core/media/pick-media';
import { useUploadStore } from '@/core/uploads/upload.store';

import { studyService } from '../api/study.service';
import { CreateSetScreen } from '../screens/CreateSetScreen';
import { EditSetInfoScreen } from '../screens/EditSetInfoScreen';
import { makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Ảnh bìa đi hết đường tạo/sửa thông tin bộ: `CreateSetScreen` gửi `coverAssetId` cùng `POST /study-sets` (khoá upload = `Idempotency-Key`
 * của lượt tạo vì bộ chưa có id); `EditSetInfoScreen` gửi `PATCH` với `coverAssetId: null` khi gỡ ảnh (BE `patchSetSchema` cho phép `null`).
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ setId: 's1' }),
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('../api/study.service', () => ({
  studyService: { create: jest.fn(), get: jest.fn(), patch: jest.fn(), workspaceAccess: jest.fn() },
}));
jest.mock('@/core/media/pick-media', () => ({ pickAudio: jest.fn(), pickImages: jest.fn() }));
jest.mock('@/core/media/compress-image', () => ({ compressImage: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@/core/uploads/upload.runner', () => ({ cancelUpload: jest.fn(), retryUpload: jest.fn() }));
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({ data: { url: 'https://cdn.example/cover.jpg' }, isPending: false, refetch: jest.fn() }),
}));
jest.mock('expo-audio', () => ({ ...jest.requireActual('../../../../__mocks__/expo-audio') }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const mocked = jest.mocked(studyService);
const uploads = () => Object.values(useUploadStore.getState().items);

beforeEach(() => {
  jest.clearAllMocks();
  useUploadStore.getState().clear();
  jest.mocked(pickImages).mockResolvedValue([
    { height: 900, kind: 'IMAGE', mime: 'image/jpeg', name: 'bia.jpg', size: 300_000, uri: 'file:///bia.jpg', width: 1200 },
  ]);
  jest.mocked(compressImage).mockResolvedValue({ height: 900, uri: 'file:///bia-nen.jpg', width: 1200 });
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, modificationTime: 0, size: 200_000, uri: '' });
});

describe('CreateSetScreen — ảnh bìa', () => {
  it('gửi coverAssetId cùng POST; khoá upload gắn với Idempotency-Key của lượt tạo', async () => {
    mocked.create.mockResolvedValue(makeSet({ id: 'new-1' }));
    await renderWithProviders(<CreateSetScreen />);
    await fireEvent.changeText(await screen.findByLabelText(/Tiêu đề/), 'Từ vựng IELTS');
    await fireEvent.press(screen.getByLabelText('Thêm ảnh: Ảnh bìa'));
    await waitFor(() => expect(uploads()).toHaveLength(1));

    await act(async () =>
      useUploadStore.getState().updateItem(uploads()[0]?.localId ?? '', { assetId: 'asset-cover', status: 'ready' }),
    );
    await fireEvent.press(screen.getAllByText('Tạo bộ học').at(-1) as never);

    await waitFor(() => expect(mocked.create).toHaveBeenCalledTimes(1));
    const [payload, key] = mocked.create.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ coverAssetId: 'asset-cover', title: 'Từ vựng IELTS' });
    expect(uploads()[0]?.scopeKey).toBe(`study-cover:${String(key)}`);
  });

  it('không chọn ảnh ⇒ payload KHÔNG có coverAssetId', async () => {
    mocked.create.mockResolvedValue(makeSet({ id: 'new-1' }));
    await renderWithProviders(<CreateSetScreen />);
    await fireEvent.changeText(await screen.findByLabelText(/Tiêu đề/), 'Bộ không bìa');

    await fireEvent.press(screen.getAllByText('Tạo bộ học').at(-1) as never);

    await waitFor(() => expect(mocked.create).toHaveBeenCalledTimes(1));
    expect(mocked.create.mock.calls[0]?.[0].coverAssetId).toBeUndefined();
  });
});

describe('EditSetInfoScreen — ảnh bìa', () => {
  beforeEach(() => {
    mocked.get.mockResolvedValue(makeSet({ coverAssetId: 'old-cover' }));
    mocked.patch.mockResolvedValue(makeSet({ coverAssetId: null, version: 4 }));
  });

  it('bấm "Xoá ảnh" rồi Lưu ⇒ PATCH mang coverAssetId: null + expectedVersion', async () => {
    await renderWithProviders(<EditSetInfoScreen />);
    await fireEvent.press(await screen.findByLabelText('Xoá ảnh: Ảnh bìa'));

    await fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(mocked.patch).toHaveBeenCalledTimes(1));
    const [setId, payload] = mocked.patch.mock.calls[0] ?? [];
    expect(setId).toBe('s1');
    expect(payload).toMatchObject({ coverAssetId: null, expectedVersion: 3, title: 'Bộ học thử' });
  });

  it('chỉ sửa tiêu đề ⇒ PATCH KHÔNG có trường coverAssetId (giữ nguyên ảnh bìa)', async () => {
    await renderWithProviders(<EditSetInfoScreen />);
    await fireEvent.changeText(await screen.findByLabelText(/Tiêu đề/), 'Tên mới');

    await fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(mocked.patch).toHaveBeenCalledTimes(1));
    const payload = mocked.patch.mock.calls[0]?.[1] ?? {};
    expect(payload).toMatchObject({ title: 'Tên mới' });
    expect('coverAssetId' in payload && payload.coverAssetId !== undefined).toBe(false);
  });
});
