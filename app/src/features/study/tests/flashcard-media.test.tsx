import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { uploadService } from '@/core/uploads/upload.service';

import { studyService } from '../api/study.service';
import { FlashcardStudyScreen } from '../screens/FlashcardStudyScreen';
import { cardMedia } from '../utils/item-summary';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Học thẻ có ảnh/âm thanh (p4-01 app.md §3 `FlashcardStudy`, §6): ảnh mặt trước/sau/lựa chọn hiện đúng mặt, có mô tả cho trình đọc
 * màn hình; âm thanh CHỈ phát khi chạm nút loa (không tự phát) và nút loa nằm NGOÀI thẻ.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ setId: 's1' }),
}));
jest.mock('../api/study.service', () => ({ studyService: { get: jest.fn(), items: jest.fn() } }));
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({ data: { url: 'https://cdn.example/x.jpg' }, isPending: false, refetch: jest.fn() }),
}));
jest.mock('@/core/uploads/upload.service', () => ({ uploadService: { getAssetUrl: jest.fn() } }));

const mockPlayer = { pause: jest.fn(), play: jest.fn(), replace: jest.fn() };
jest.mock('expo-audio', () => ({
  ...jest.requireActual('../../../../__mocks__/expo-audio'),
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 0, playing: false }),
}));

const mocked = jest.mocked(studyService);

beforeEach(() => {
  jest.clearAllMocks();
  mocked.get.mockResolvedValue(makeSet());
  jest.mocked(uploadService.getAssetUrl).mockResolvedValue({ expiresAt: 'x', url: 'https://cdn.example/a.m4a' });
});

function withItems(...items: ReturnType<typeof makeItem>[]) {
  mocked.items.mockResolvedValue({ items, setVersion: 3 });
}

describe('FlashcardStudyScreen — ảnh', () => {
  it('ảnh mặt trước hiện ở mặt trước; lật ⇒ ảnh mặt sau thay chỗ; nhãn thẻ báo có ảnh', async () => {
    withItems(makeItem({ backMediaAssetId: 'img-back', frontMediaAssetId: 'img-front' }));
    await renderWithProviders(<FlashcardStudyScreen />);

    expect(await screen.findByLabelText('Ảnh minh hoạ mặt trước')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Ảnh minh hoạ mặt sau')).toBeNull();
    expect(screen.getByLabelText(/^Thẻ 1\/1\. Mặt trước: Thuật ngữ\. Có ảnh minh hoạ/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText(/^Thẻ 1\/1\. Mặt trước/));

    expect(await screen.findByLabelText('Ảnh minh hoạ mặt sau')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Ảnh minh hoạ mặt trước')).toBeNull();
  });

  it('trắc nghiệm: ảnh từng lựa chọn hiện ở mặt trước kèm chữ cái A/B khớp dòng lựa chọn', async () => {
    withItems(makeChoiceItem()); // lựa chọn B ("Huế") có `mediaAssetId: 'asset-1'`
    await renderWithProviders(<FlashcardStudyScreen />);

    expect(await screen.findByLabelText('Ảnh lựa chọn B')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Ảnh lựa chọn A')).toBeNull();
    expect(screen.getByText('B. Huế')).toBeOnTheScreen();
  });

  it('thẻ chỉ có chữ: không ảnh, không nút loa, nhãn không nhắc ảnh', async () => {
    withItems(makeItem());
    await renderWithProviders(<FlashcardStudyScreen />);

    expect(await screen.findByLabelText(/^Thẻ 1\/1\. Mặt trước: Thuật ngữ$/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Ảnh minh hoạ/)).toBeNull();
    expect(screen.queryByLabelText('Nghe phát âm')).toBeNull();
  });
});

describe('FlashcardStudyScreen — âm thanh', () => {
  it('có nút loa NGOÀI thẻ; KHÔNG tự phát; chạm ⇒ xin URL ký của đúng asset rồi phát', async () => {
    withItems(makeItem({ audioAssetId: 'aud-1' }));
    await renderWithProviders(<FlashcardStudyScreen />);

    const speaker = await screen.findByLabelText('Nghe phát âm');
    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(uploadService.getAssetUrl).not.toHaveBeenCalled();

    await fireEvent.press(speaker);

    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
    expect(uploadService.getAssetUrl).toHaveBeenCalledWith('aud-1');
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'https://cdn.example/a.m4a' });
  });
});

describe('cardMedia', () => {
  it('chỉ trắc nghiệm mới có ảnh lựa chọn; nhãn A/B/C theo VỊ TRÍ lựa chọn (không theo lựa chọn có ảnh)', () => {
    const choice = makeChoiceItem({
      options: [
        { id: 'o_aaaaaa', mediaAssetId: null, text: 'Một' },
        { id: 'o_bbbbbb', mediaAssetId: 'img-b', text: 'Hai' },
        { id: 'o_cccccc', mediaAssetId: 'img-c', text: 'Ba' },
      ],
    });
    expect(cardMedia(choice).optionImages).toEqual([
      { assetId: 'img-b', label: 'B' },
      { assetId: 'img-c', label: 'C' },
    ]);
    expect(cardMedia(makeItem({ frontMediaAssetId: 'f', options: choice.options })).optionImages).toEqual([]);
  });
});
