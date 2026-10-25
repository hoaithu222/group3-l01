import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { compressImage } from '@/core/media/compress-image';
import { pickImages } from '@/core/media/pick-media';
import { useUploadStore } from '@/core/uploads/upload.store';

import { SetForm, type SetFormProps } from '../components/SetForm';
import { FALLBACK_STUDY_LIMITS, type StudyLimits } from '../constants/study.constants';
import { renderWithProviders } from './render-helpers';

/**
 * Ảnh bìa bộ học (p4-01 app.md §3 `CreateSet`): tải qua hàng đợi upload scope `STUDY` (khoá theo lượt tạo/bộ), khoá nút gửi khi
 * còn tệp dang dở, và gửi ĐÚNG ba trạng thái cho BE — ảnh mới (chuỗi) · gỡ ảnh sẵn có (`null`) · không đổi (`undefined`, JSON bỏ trường).
 */
jest.mock('@/core/media/pick-media', () => ({ pickAudio: jest.fn(), pickImages: jest.fn() }));
jest.mock('@/core/media/compress-image', () => ({ compressImage: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@/core/uploads/upload.runner', () => ({ cancelUpload: jest.fn(), retryUpload: jest.fn() }));
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({ data: { url: 'https://cdn.example/cover.jpg' }, isPending: false, refetch: jest.fn() }),
}));
jest.mock('expo-audio', () => ({ ...jest.requireActual('../../../../__mocks__/expo-audio') }));

const LIMITS: StudyLimits = { ...FALLBACK_STUDY_LIMITS };
const uploads = () => Object.values(useUploadStore.getState().items);

function props(overrides: Partial<SetFormProps> = {}): SetFormProps {
  return {
    canUseWorkspace: false,
    coverScopeId: 'cover-1',
    initial: { description: '', tags: [], title: 'Bộ A', visibility: 'PRIVATE' },
    initialCoverAssetId: null,
    limits: LIMITS,
    onSubmit: jest.fn(),
    submitLabel: 'Tạo bộ học',
    submitting: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useUploadStore.getState().clear();
  jest.mocked(pickImages).mockResolvedValue([
    { height: 1000, kind: 'IMAGE', mime: 'image/jpeg', name: 'bia.jpg', size: 300_000, uri: 'file:///bia.jpg', width: 1500 },
  ]);
  jest.mocked(compressImage).mockResolvedValue({ height: 1000, uri: 'file:///bia-nen.jpg', width: 1500 });
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, modificationTime: 0, size: 250_000, uri: '' });
});

const submitButton = () => screen.getByRole('button', { name: 'Tạo bộ học' });

describe('SetForm — ảnh bìa', () => {
  it('chọn ảnh ⇒ tải theo khoá của lượt tạo; đang tải khoá gửi; READY ⇒ onSubmit mang coverAssetId', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<SetForm {...props({ onSubmit })} />);

    await fireEvent.press(screen.getByLabelText('Thêm ảnh: Ảnh bìa'));

    await waitFor(() => expect(uploads()).toHaveLength(1));
    expect(uploads()[0]).toMatchObject({ kind: 'IMAGE', mime: 'image/jpeg', scope: 'STUDY', scopeKey: 'study-cover:cover-1' });
    expect(await screen.findByText(/Chờ ảnh bìa tải xong/)).toBeOnTheScreen();
    expect(submitButton()).toBeDisabled();

    await act(async () =>
      useUploadStore.getState().updateItem(uploads()[0]?.localId ?? '', { assetId: 'asset-cover', status: 'ready' }),
    );

    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(screen.queryByText(/Chờ ảnh bìa tải xong/)).toBeNull();
    await fireEvent.press(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ coverAssetId: 'asset-cover', title: 'Bộ A' });
  });

  it('không chọn ảnh ⇒ coverAssetId là undefined (không gửi trường)', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<SetForm {...props({ onSubmit })} />);

    await fireEvent.press(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].coverAssetId).toBeUndefined();
  });

  it('sửa bộ đã có ảnh bìa: để nguyên ⇒ undefined; bấm "Xoá ảnh" ⇒ null (BE `coverAssetId: null` gỡ ảnh)', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(
      <SetForm {...props({ coverScopeId: 's1', initialCoverAssetId: 'old-cover', onSubmit, submitLabel: 'Lưu' })} />,
    );
    expect(screen.getByRole('imagebutton', { name: 'Ảnh bìa' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].coverAssetId).toBeUndefined();

    await fireEvent.press(screen.getByLabelText('Xoá ảnh: Ảnh bìa'));
    expect(screen.queryByRole('imagebutton', { name: 'Ảnh bìa' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[0].coverAssetId).toBeNull();
  });

  it('tải lỗi ⇒ khoá gửi cho tới khi bỏ tệp; bỏ xong thì gửi được (không kèm ảnh)', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<SetForm {...props({ onSubmit })} />);
    await fireEvent.press(screen.getByLabelText('Thêm ảnh: Ảnh bìa'));
    await waitFor(() => expect(uploads()).toHaveLength(1));

    await act(async () =>
      useUploadStore.getState().updateItem(uploads()[0]?.localId ?? '', { errorCode: 'ASSET_002', status: 'failed' }),
    );
    expect(submitButton()).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Bỏ tệp tải lỗi: Ảnh bìa'));
    await waitFor(() => expect(submitButton()).toBeEnabled());
    await fireEvent.press(submitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].coverAssetId).toBeUndefined();
  });

  it('rời form ⇒ dọn tệp của khoá này khỏi hàng đợi (không để lại tệp READY mồ côi)', async () => {
    const view = await renderWithProviders(<SetForm {...props()} />);
    await fireEvent.press(screen.getByLabelText('Thêm ảnh: Ảnh bìa'));
    await waitFor(() => expect(uploads()).toHaveLength(1));
    await act(async () =>
      useUploadStore.getState().updateItem(uploads()[0]?.localId ?? '', { assetId: 'asset-cover', status: 'ready' }),
    );

    await view.unmount();

    expect(uploads()).toHaveLength(0);
  });
});
