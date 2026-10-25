import { fireEvent, render, screen } from '@testing-library/react-native';

import type { MessageAttachment } from '../api/chat.types';
import { VoiceNotePlayer } from '../components/bubble/VoiceNotePlayer';

/**
 * Tin nhắn thoại — trợ năng của thanh tua và nút tốc độ:
 *  · thanh tua là `adjustable`: trình đọc màn hình không chỉ được toạ độ nên phải tua bằng vuốt lên/xuống (±5 giây) và
 *    nghe được giá trị "0:12 trên 0:45";
 *  · tua không được vượt hai đầu (0 và hết bài);
 *  · nút tốc độ đổi nhãn theo tốc độ hiện tại và đổi tốc độ phát thật.
 */

const mockPlayer = {
  pause: jest.fn(),
  play: jest.fn(),
  seekTo: jest.fn(async () => undefined),
  setPlaybackRate: jest.fn(),
};
const mockStatus = { currentTime: 12, duration: 45, playing: false };

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
}));
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({ data: { url: 'https://cdn.example/voice.m4a' } }),
}));

const ATTACHMENT = {
  assetId: 'asset-1',
  durationMs: 45_000,
  kind: 'VOICE',
  waveform: [10, 40, 70, 30],
} as unknown as MessageAttachment;

const seekBar = () => screen.getByRole('adjustable', { name: 'Vị trí phát tin nhắn thoại' });

function doAction(actionName: 'decrement' | 'increment') {
  return fireEvent(seekBar(), 'accessibilityAction', { nativeEvent: { actionName } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus.currentTime = 12;
  mockStatus.duration = 45;
  mockStatus.playing = false;
});

describe('VoiceNotePlayer — thanh tua', () => {
  it('là `adjustable`, đọc được vị trí hiện tại "0:12 trên 0:45"', async () => {
    await render(<VoiceNotePlayer attachment={ATTACHMENT} tone="default" />);

    expect(seekBar().props.accessibilityValue).toEqual({
      max: 45,
      min: 0,
      now: 12,
      text: '0:12 trên 0:45',
    });
  });

  it('khai hai hành động tua để trình đọc màn hình gọi được', async () => {
    await render(<VoiceNotePlayer attachment={ATTACHMENT} tone="default" />);

    expect(seekBar().props.accessibilityActions).toEqual([
      { label: 'Tua tới 5 giây', name: 'increment' },
      { label: 'Tua lùi 5 giây', name: 'decrement' },
    ]);
  });

  it('`increment` tua tới 5 giây, `decrement` lùi 5 giây', async () => {
    await render(<VoiceNotePlayer attachment={ATTACHMENT} tone="default" />);

    await doAction('increment');
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(17);

    await doAction('decrement');
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(7);
  });

  it('không tua quá hai đầu: gần cuối thì dừng ở hết bài, gần đầu thì dừng ở 0', async () => {
    await render(<VoiceNotePlayer attachment={ATTACHMENT} tone="default" />);

    mockStatus.currentTime = 43;
    await doAction('increment');
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(45);

    mockStatus.currentTime = 2;
    await doAction('decrement');
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
  });

  it('chưa biết thời lượng (0) ⇒ không tua gì cả', async () => {
    mockStatus.duration = 0;
    await render(
      <VoiceNotePlayer attachment={{ ...ATTACHMENT, durationMs: 0 } as never} tone="default" />,
    );

    await doAction('increment');

    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  });
});

describe('VoiceNotePlayer — nút tốc độ', () => {
  it('nhãn nói tốc độ hiện tại; bấm đổi sang 1.5x và ra lệnh cho player', async () => {
    await render(<VoiceNotePlayer attachment={ATTACHMENT} tone="default" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tốc độ 1x' }));

    expect(mockPlayer.setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(screen.getByRole('button', { name: 'Tốc độ 1.5x' })).toBeOnTheScreen();
  });
});
