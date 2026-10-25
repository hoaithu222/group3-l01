import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { uploadService } from '@/core/uploads/upload.service';
import { showToast } from '@/shared/utils/toast.utils';

import { StudyAudioButton } from '../components/StudyAudioButton';

/**
 * Nút loa của mục học (app.md p4-01 §6): chỉ phát khi CHẠM (không tự phát), xin URL ký LÚC BẤM (URL sống ≤ 60 s nên dựng sẵn khi
 * mở màn là hết hạn lúc bấm), bấm lại để dừng, hết bài/lỗi thì xử lý êm.
 */
const mockPlayer = {
  pause: jest.fn(),
  play: jest.fn(),
  replace: jest.fn(),
};
const mockStatus = { currentTime: 0, duration: 0, playing: false };

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
}));
jest.mock('@/core/uploads/upload.service', () => ({ uploadService: { getAssetUrl: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const getAssetUrl = jest.mocked(uploadService.getAssetUrl);

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus.currentTime = 0;
  mockStatus.duration = 0;
  mockStatus.playing = false;
  getAssetUrl.mockResolvedValue({ expiresAt: '2026-09-26T00:00:00.000Z', url: 'https://cdn.example/a.m4a' });
});

describe('StudyAudioButton', () => {
  it('KHÔNG tự phát và không gọi mạng khi hiện ra', async () => {
    await render(<StudyAudioButton assetId="audio-1" />);

    expect(await screen.findByLabelText('Nghe phát âm')).toBeOnTheScreen();
    expect(getAssetUrl).not.toHaveBeenCalled();
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('chạm ⇒ xin URL của ĐÚNG asset rồi nạp + phát', async () => {
    await render(<StudyAudioButton assetId="audio-1" label="Âm thanh mặt trước" />);

    await fireEvent.press(screen.getByLabelText('Âm thanh mặt trước'));

    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
    expect(getAssetUrl).toHaveBeenCalledWith('audio-1');
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'https://cdn.example/a.m4a' });
  });

  it('đang phát: nhãn đổi thành "Dừng phát…" và chạm ⇒ dừng, không xin URL nữa', async () => {
    mockStatus.playing = true;
    await render(<StudyAudioButton assetId="audio-1" />);

    await fireEvent.press(screen.getByLabelText('Dừng phát: Nghe phát âm'));

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(getAssetUrl).not.toHaveBeenCalled();
  });

  it('phát xong rồi chạm lại ⇒ xin URL MỚI (URL cũ có thể đã hết hạn) và phát từ đầu', async () => {
    await render(<StudyAudioButton assetId="audio-1" />);
    await fireEvent.press(screen.getByLabelText('Nghe phát âm'));
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));

    mockStatus.duration = 5;
    mockStatus.currentTime = 5;
    getAssetUrl.mockResolvedValueOnce({ expiresAt: 'x', url: 'https://cdn.example/a2.m4a' });
    await fireEvent.press(screen.getByLabelText('Nghe phát âm'));

    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(2));
    expect(getAssetUrl).toHaveBeenCalledTimes(2);
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: 'https://cdn.example/a2.m4a' });
  });

  it('xin URL lỗi ⇒ toast tiếng Việt, không phát, không ném Promise reject', async () => {
    getAssetUrl.mockRejectedValueOnce(new Error('mạng'));
    await render(<StudyAudioButton assetId="audio-1" />);

    await fireEvent.press(screen.getByLabelText('Nghe phát âm'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('error', 'Không phát được âm thanh. Hãy thử lại.'),
    );
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });
});
