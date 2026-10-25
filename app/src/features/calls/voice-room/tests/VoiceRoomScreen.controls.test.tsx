import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { FakeCallMedia } from '@/core/media/call-media.fake';
import { setCallMediaForTests } from '@/core/media/call-media.registry';
import { ensureMicrophonePermission } from '@/core/media/permissions';
import { useBreakpoint } from '@/shared/theme';
import { showToast } from '@/shared/utils/toast.utils';

import { useCallMediaStore } from '../../store/call-media.store';
import { callStoreApi } from '../../store/call.store';
import { voiceRoomService } from '../api/voice-room.service';
import { VoiceRoomScreen } from '../screens/VoiceRoomScreen';
import { useVoiceRoomStore } from '../store/voice-room.store';
import { renderWithProviders, setupRoomScreen, sheetLayersWithoutFlex1 } from './helpers';

/** Màn phòng thoại (app.md §3, §8) — mic bị chặn, lời nhắc của chủ phòng, giơ tay, mất kết nối, bị mời ra, chat phòng. */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shared/theme', () => ({ ...jest.requireActual('@/shared/theme'), useBreakpoint: jest.fn() }));
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
}));
jest.mock('../api/voice-room.service', () => ({
  voiceRoomService: { getPreview: jest.fn(), hostAction: jest.fn(), leaveRoom: jest.fn(() => Promise.resolve({})), setHand: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../../api/calls.service', () => ({ callsService: { get: jest.fn(), getMyActive: jest.fn() } }));

const svc = jest.mocked(voiceRoomService);
let media: FakeCallMedia;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useBreakpoint).mockReturnValue({ isLandscape: false, isTablet: false, tier: 'phone', width: 390 } as never);
  media = setupRoomScreen();
});

afterEach(() => setCallMediaForTests(null));

describe('VoiceRoomScreen — mic và lời nhắc của chủ phòng', () => {
  it('VR-08: bị chủ phòng chặn phát biểu → nút mic KHOÁ + nhãn "Bị chặn" + lời giải thích; không bật được', async () => {
    useVoiceRoomStore.getState().patch({ audioBlocked: true });
    useCallMediaStore.getState().patch({ micOn: false });
    await renderWithProviders(<VoiceRoomScreen />);
    expect(screen.getByText('Bị chặn')).toBeOnTheScreen();
    expect(screen.getByText(/Chủ phòng đã chặn phát biểu/)).toBeOnTheScreen();
    const mic = screen.getByLabelText('Micro bị chủ phòng chặn');
    expect(mic).toBeDisabled();
    const spy = jest.spyOn(media, 'setMicrophoneEnabled');
    await fireEvent.press(mic);
    expect(spy).not.toHaveBeenCalled();
  });

  it('chủ phòng đề nghị tắt mic → lời nhắc; "Tắt mic" tắt mic của máy này', async () => {
    useVoiceRoomStore.getState().patch({ muteRequestAt: Date.now() });
    await renderWithProviders(<VoiceRoomScreen />);
    expect(screen.getByText('Chủ phòng đề nghị bạn tắt mic.')).toBeOnTheScreen();
    const spy = jest.spyOn(media, 'setMicrophoneEnabled');
    await fireEvent.press(screen.getByRole('button', { name: 'Tắt mic' })); // nút của lời nhắc (nút mic thanh điều khiển tên "Tắt micro")
    expect(spy).toHaveBeenCalledWith(false);
    expect(useVoiceRoomStore.getState().muteRequestAt).toBeNull();
  });

  it('được mời phát biểu → "Bật mic" xin quyền LÚC NÀY rồi bật; bị từ chối quyền → toast, mic giữ nguyên', async () => {
    useCallMediaStore.getState().patch({ micOn: false });
    useVoiceRoomStore.getState().patch({ inviteSpeakAt: Date.now() });
    jest.mocked(ensureMicrophonePermission).mockResolvedValueOnce('denied');
    await renderWithProviders(<VoiceRoomScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bật mic' })); // nút của lời mời (nút mic thanh điều khiển tên "Bật micro")
    await act(async () => Promise.resolve());
    expect(showToast).toHaveBeenCalledWith('warning', expect.stringContaining('quyền micro'));
    expect(useCallMediaStore.getState().micOn).toBe(false);

    await fireEvent.press(screen.getByLabelText('Bật micro'));
    await act(async () => Promise.resolve());
    expect(ensureMicrophonePermission).toHaveBeenCalledTimes(2);
    expect(useCallMediaStore.getState().micOn).toBe(true);
  });
});

describe('VoiceRoomScreen — giơ tay, kết nối, bị mời ra, chat', () => {
  it('giơ tay: nút đổi "Hạ tay" ngay (optimistic) và gọi API; ô của mình hiện "Đang giơ tay"', async () => {
    await renderWithProviders(<VoiceRoomScreen />);
    await fireEvent.press(screen.getByLabelText('Giơ tay'));
    expect(svc.setHand).toHaveBeenCalledWith('call1', true);
    expect(await screen.findByLabelText('Hạ tay')).toBeOnTheScreen();
    expect(screen.getByText('Đang giơ tay')).toBeOnTheScreen();
  });

  it('mất kết nối media → banner "đang nối lại"', async () => {
    useCallMediaStore.getState().patch({ connection: 'reconnecting' });
    await renderWithProviders(<VoiceRoomScreen />);
    expect(screen.getByText('Mất kết nối — đang nối lại…')).toBeOnTheScreen();
  });

  it('VR-06: bị mời ra → màn nói rõ lý do; "Về kênh" đóng phòng', async () => {
    await renderWithProviders(<VoiceRoomScreen />);
    await act(async () => callStoreApi.dispatch({ reason: 'REMOVED_BY_HOST', type: 'LOCAL_ENDED' }));
    expect(await screen.findByText('Bạn đã được mời ra khỏi phòng')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Về kênh'));
    expect(callStoreApi.get().phase).toBe('idle');
  });

  it('không được nối chat → không có nút Chat', async () => {
    await renderWithProviders(<VoiceRoomScreen />);
    expect(screen.queryByLabelText('Mở chat của phòng')).toBeNull();
  });

  it('có chat: điện thoại → tấm trượt; tablet → khung cạnh lưới (không có tiêu đề tấm)', async () => {
    const chat = (id: string) => <Text>{`chat-${id}`}</Text>;
    const phone = await renderWithProviders(<VoiceRoomScreen renderRoomChat={chat} />);
    await fireEvent.press(screen.getByLabelText('Mở chat của phòng'));
    expect(await screen.findByText('chat-ch1')).toBeOnTheScreen();
    expect(screen.getByText('Chat của phòng')).toBeOnTheScreen(); // tiêu đề tấm trượt
    expect(sheetLayersWithoutFlex1(screen.getByText('chat-ch1'))).toEqual([]); // thân tấm giãn hết — ô soạn ở đáy, không sập
    await phone.unmount();

    jest.mocked(useBreakpoint).mockReturnValue({ isLandscape: true, isTablet: true, tier: 'tablet', width: 900 } as never);
    await renderWithProviders(<VoiceRoomScreen renderRoomChat={chat} />);
    await fireEvent.press(screen.getByLabelText('Mở chat của phòng'));
    expect(await screen.findByText('chat-ch1')).toBeOnTheScreen();
    expect(screen.queryByText('Chat của phòng')).toBeNull();
  });
});
