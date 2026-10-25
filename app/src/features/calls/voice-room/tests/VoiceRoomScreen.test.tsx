import { act, fireEvent, screen } from '@testing-library/react-native';

import { setCallMediaForTests } from '@/core/media/call-media.registry';
import { useBreakpoint } from '@/shared/theme';
import { showToast } from '@/shared/utils/toast.utils';

import { callStoreApi } from '../../store/call.store';
import { voiceRoomService } from '../api/voice-room.service';
import { VoiceRoomScreen } from '../screens/VoiceRoomScreen';
import { enterRoom, makeParticipant, makeRoomCall, renderWithProviders, ROOM_TOKEN, setupRoomScreen } from './helpers';

/** Màn phòng thoại (app.md §3, §8) — hiển thị, danh sách người, thao tác của chủ phòng, rời phòng. Mic/lời nhắc/giơ tay/chat: `VoiceRoomScreen.controls.test.tsx`. */
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
/** Mình là chủ phòng, kèm các người khác. */
const asHost = (...others: Parameters<typeof makeParticipant>[0][]) => [makeParticipant({ role: 'HOST', userId: 'me' }), ...others.map(makeParticipant)];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useBreakpoint).mockReturnValue({ isLandscape: false, isTablet: false, tier: 'phone', width: 390 } as never);
  setupRoomScreen();
});

afterEach(() => setCallMediaForTests(null));

const openParticipants = async () => fireEvent.press(screen.getByLabelText(/Danh sách người tham gia/));

describe('VoiceRoomScreen — hiển thị', () => {
  it('tên kênh, số người, nhãn "Chủ phòng" trên ô của host; chưa nói "đã tham gia" khi media chưa kết nối', async () => {
    await renderWithProviders(<VoiceRoomScreen />);
    expect(screen.getByText('#phong-hoc')).toBeOnTheScreen();
    expect(screen.getByText(/· 3 người/)).toBeOnTheScreen();
    expect(screen.getByText('Chủ phòng')).toBeOnTheScreen();
    expect(screen.getByText('Bạn')).toBeOnTheScreen();

    await act(async () => {
      callStoreApi.dispatch({ type: 'RESET' });
      callStoreApi.dispatch({ clientCallId: 'c', type: 'START_BEGIN' });
      callStoreApi.dispatch({ call: makeRoomCall(), joined: false, token: ROOM_TOKEN, type: 'START_OK' });
    });
    expect(await screen.findByText('Đang vào phòng…')).toBeOnTheScreen(); // phase `connecting` (chưa MEDIA_CONNECTED)
  });

  it('chỉ mình trong phòng → gợi ý "Bạn là người đầu tiên"', async () => {
    enterRoom({ hostId: 'me', participants: asHost() });
    await renderWithProviders(<VoiceRoomScreen />);
    expect(screen.getByText(/Bạn là người đầu tiên/)).toBeOnTheScreen();
  });
});

describe('VoiceRoomScreen — danh sách người và thao tác của chủ phòng', () => {
  it('người thường: danh sách người tham gia KHÔNG có nút ⋯ điều khiển', async () => {
    await renderWithProviders(<VoiceRoomScreen />);
    await openParticipants();
    expect(await screen.findByText('Người tham gia (3)')).toBeOnTheScreen(); // tiêu đề tấm; tên "Lan" còn hiện ở cả lưới nên không dùng làm mốc
    expect(screen.getByText('Trong phòng')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Điều khiển/)).toBeNull();
  });

  it('chủ phòng: có ⋯ ở người khác (không ở chính mình); chặn phát biểu gửi expectedVersion + đích, có toast', async () => {
    enterRoom({ hostId: 'me', participants: asHost({ name: 'Lan', userId: 'lan' }), version: 6 });
    svc.hostAction.mockResolvedValue(makeRoomCall({ hostId: 'me', version: 7 }));
    await renderWithProviders(<VoiceRoomScreen />);
    await openParticipants();
    expect(screen.getAllByLabelText(/Điều khiển/)).toHaveLength(1);

    await fireEvent.press(screen.getByLabelText('Điều khiển Lan'));
    await fireEvent.press(await screen.findByText('Chặn phát biểu'));
    expect(svc.hostAction).toHaveBeenCalledWith('call1', 'BLOCK_AUDIO', { expectedVersion: 6, targetUserId: 'lan' });
    await act(async () => Promise.resolve());
    expect(showToast).toHaveBeenCalledWith('success', 'Đã chặn phát biểu');
  });

  it('CALL_011 khi thao tác → toast "Trạng thái phòng đã thay đổi" (không lộ mã lỗi)', async () => {
    enterRoom({ hostId: 'me', participants: asHost({ name: 'Lan', userId: 'lan' }) });
    svc.hostAction.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { data: { error: { code: 'CALL_011' } }, status: 409 } }));
    const { callsService } = jest.requireMock('../../api/calls.service') as { callsService: { get: jest.Mock } };
    callsService.get.mockResolvedValue(makeRoomCall({ hostId: 'me', version: 9 }));
    await renderWithProviders(<VoiceRoomScreen />);
    await openParticipants();
    await fireEvent.press(screen.getByLabelText('Điều khiển Lan'));
    await fireEvent.press(await screen.findByText('Yêu cầu tắt mic'));
    await act(async () => Promise.resolve());
    expect(showToast).toHaveBeenCalledWith('error', 'Trạng thái phòng đã thay đổi');
  });
});

describe('VoiceRoomScreen — rời phòng', () => {
  it('người thường bấm Rời → rời NGAY (không hộp thoại), ngắt phía máy này', async () => {
    await renderWithProviders(<VoiceRoomScreen />);
    await fireEvent.press(screen.getByLabelText('Rời phòng'));
    expect(svc.leaveRoom).toHaveBeenCalledWith('call1', {});
    expect(callStoreApi.get()).toMatchObject({ endedInfo: { reason: 'LEFT' }, phase: 'ended' });
  });

  it('VR-11: chủ phòng bấm Rời → hộp thoại chọn người nhận/kết thúc, CHƯA rời; chuyển quyền gửi transferToUserId', async () => {
    enterRoom({ hostId: 'me', participants: asHost({ name: 'Lan', userId: 'lan' }) });
    await renderWithProviders(<VoiceRoomScreen />);
    await fireEvent.press(screen.getByLabelText('Rời phòng'));
    expect(await screen.findByText('Bạn là chủ phòng')).toBeOnTheScreen();
    expect(svc.leaveRoom).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Chuyển quyền và rời'));
    expect(svc.leaveRoom).toHaveBeenCalledWith('call1', { transferToUserId: 'lan' });
  });
});
