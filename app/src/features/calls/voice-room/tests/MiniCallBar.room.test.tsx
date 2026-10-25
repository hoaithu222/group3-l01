import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { setCallMediaForTests } from '@/core/media/call-media.registry';

import { MiniCallBar } from '../../components/MiniCallBar';
import { useCallMediaStore } from '../../store/call-media.store';
import { callStoreApi } from '../../store/call.store';
import { voiceRoomService } from '../api/voice-room.service';
import { useVoiceRoomStore } from '../store/voice-room.store';
import { enterRoom, makeParticipant, makeRoomCall, renderWithProviders, ROOM_TOKEN, setupRoomScreen } from './helpers';

/** `MiniCallBar` cho phòng thoại (app.md §3): "#tên-kênh · N người — Quay lại phòng" + mic + Rời khi thu nhỏ; cuộc gọi RING giữ nguyên. */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/voice-room.service', () => ({ voiceRoomService: { leaveRoom: jest.fn(() => Promise.resolve({})) } }));
jest.mock('../../api/calls.service', () => ({ callsService: { get: jest.fn(), getMyActive: jest.fn() } }));

const minimize = () => callStoreApi.dispatch({ minimized: true, type: 'MINIMIZE' });

beforeEach(() => {
  jest.clearAllMocks();
  setupRoomScreen();
});
afterEach(() => setCallMediaForTests(null));

describe('MiniCallBar — phòng thoại kênh', () => {
  it('chưa thu nhỏ (đang ở màn phòng) → không vẽ', async () => {
    await renderWithProviders(<MiniCallBar />);
    expect(screen.queryByText(/Quay lại phòng/)).toBeNull();
  });

  it('thu nhỏ → "#tên-kênh · 3 người — Quay lại phòng"; chạm mở lại màn phòng', async () => {
    minimize();
    await renderWithProviders(<MiniCallBar />);
    expect(screen.getByText('#phong-hoc · 3 người — Quay lại phòng')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(/Quay lại phòng/));
    expect(router.push).toHaveBeenCalledWith({ params: { callId: 'call1' }, pathname: '/call/[callId]' });
  });

  it('nút mic: bật/tắt mic của máy này; bị chủ phòng chặn → khoá', async () => {
    minimize();
    await renderWithProviders(<MiniCallBar />);
    await fireEvent.press(screen.getByLabelText('Tắt micro'));
    await Promise.resolve();
    expect(useCallMediaStore.getState().micOn).toBe(false);

    useVoiceRoomStore.getState().patch({ audioBlocked: true });
    expect(await screen.findByLabelText('Micro bị chủ phòng chặn')).toBeDisabled();
  });

  it('người thường bấm Rời → rời phòng ngay từ thanh nhỏ', async () => {
    minimize();
    await renderWithProviders(<MiniCallBar />);
    await fireEvent.press(screen.getByLabelText('Rời phòng'));
    expect(voiceRoomService.leaveRoom).toHaveBeenCalledWith('call1', {});
  });

  it('chủ phòng bấm Rời → về màn phòng để chọn người nhận quyền (không rời "mù")', async () => {
    enterRoom({ hostId: 'me', participants: [makeParticipant({ role: 'HOST', userId: 'me' }), makeParticipant({ userId: 'lan' })] });
    minimize();
    await renderWithProviders(<MiniCallBar />);
    await fireEvent.press(screen.getByLabelText('Rời phòng'));
    expect(voiceRoomService.leaveRoom).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ params: { callId: 'call1' }, pathname: '/call/[callId]' });
  });

  it('cuộc gọi RING (không phải phòng) giữ thanh cũ: "Cuộc gọi đang diễn ra … Quay lại"', async () => {
    callStoreApi.dispatch({ type: 'RESET' });
    callStoreApi.dispatch({ clientCallId: 'c', type: 'START_BEGIN' });
    callStoreApi.dispatch({
      call: makeRoomCall({ mode: 'RING', scope: { avatarUrl: null, kind: 'DIRECT', title: 'Nam' }, scopeId: 'conv1', scopeType: 'CONVERSATION' }),
      joined: true,
      token: ROOM_TOKEN,
      type: 'START_OK',
    });
    callStoreApi.dispatch({ type: 'MEDIA_CONNECTED' });
    minimize();
    await renderWithProviders(<MiniCallBar />);
    expect(screen.getByLabelText('Cuộc gọi đang diễn ra. Quay lại cuộc gọi')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Rời phòng')).toBeNull();
  });
});
