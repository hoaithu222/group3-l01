import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { FakeCallMedia } from '@/core/media/call-media.fake';
import { setCallMediaForTests } from '@/core/media/call-media.registry';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { VOICE_HOST_ACTION_EVENT, type CallHostActionPayload } from '../../api/calls.socket.types';
import { useCallMediaStore } from '../../store/call-media.store';
import { callStoreApi } from '../../store/call.store';
import { resetHostActionDedupe } from '../hooks/host-action-handler';
import { useHostActionsListener } from '../hooks/useHostActionsListener';
import { useVoiceRoomStore } from '../store/voice-room.store';
import { makeRoomCall } from './helpers';

/** `call:host-action` (app.md §4, §8 VR-08/VR-11): bỏ chặn KHÔNG bật mic; mời ra ngắt media; đổi chủ cập nhật host. */
const mockHandlers = new Map<string, (payload: unknown) => void>();
jest.mock('@/core/socket', () => ({
  SocketEvent: jest.requireActual('@/core/socket/socket.events').SocketEvent,
  useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
  },
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

let media: FakeCallMedia;

function payload(over: Partial<CallHostActionPayload>): CallHostActionPayload {
  return { byUserId: 'host', callId: 'call1', serverNow: '2026-09-25T10:00:00.000Z', targetUserId: 'me', type: 'MUTE_REQUEST', v: 1, version: 2, ...over };
}
const emit = (p: CallHostActionPayload) => act(() => mockHandlers.get(VOICE_HOST_ACTION_EVENT)?.(p));

async function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return renderHook(() => useHostActionsListener(), { wrapper });
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockHandlers.clear();
  resetHostActionDedupe();
  media = new FakeCallMedia();
  setCallMediaForTests(media);
  useAuthStore.setState({ user: { id: 'me' } } as never);
  useVoiceRoomStore.getState().reset();
  useCallMediaStore.getState().reset();
  callStoreApi.dispatch({ type: 'RESET' });
  callStoreApi.dispatch({ clientCallId: 'c1', type: 'START_BEGIN' });
  callStoreApi.dispatch({ call: makeRoomCall(), joined: false, token: { expiresAt: 'x', livekitUrl: 'wss://lk', token: 't' }, type: 'START_OK' });
  callStoreApi.dispatch({ type: 'MEDIA_CONNECTED' });
  useCallMediaStore.getState().patch({ micOn: true });
  await mount();
});

afterEach(() => setCallMediaForTests(null));

describe('useHostActionsListener', () => {
  it('AUDIO_BLOCKED (mình): khoá nút mic, tắt mic ở máy này', async () => {
    const spy = jest.spyOn(media, 'setMicrophoneEnabled');
    await emit(payload({ type: 'AUDIO_BLOCKED' }));
    expect(useVoiceRoomStore.getState().audioBlocked).toBe(true);
    expect(spy).toHaveBeenCalledWith(false);
    await act(async () => Promise.resolve());
    expect(useCallMediaStore.getState().micOn).toBe(false);
  });

  it('AUDIO_UNBLOCKED (mình): mở khoá + toast, KHÔNG bật mic (chủ phòng không bật mic hộ — VR-08)', async () => {
    useVoiceRoomStore.getState().patch({ audioBlocked: true });
    useCallMediaStore.getState().patch({ micOn: false });
    const spy = jest.spyOn(media, 'setMicrophoneEnabled');
    await emit(payload({ type: 'AUDIO_UNBLOCKED' }));
    expect(useVoiceRoomStore.getState().audioBlocked).toBe(false);
    expect(showToast).toHaveBeenCalledWith('info', 'Bạn có thể bật mic lại');
    expect(spy).not.toHaveBeenCalled();
    expect(useCallMediaStore.getState().micOn).toBe(false);
  });

  it('MUTE_REQUEST / INVITE_SPEAK (mình): chỉ hiện lời nhắc, không đổi media; của người KHÁC thì bỏ qua', async () => {
    const spy = jest.spyOn(media, 'setMicrophoneEnabled');
    await emit(payload({ targetUserId: 'someone-else', type: 'MUTE_REQUEST' }));
    expect(useVoiceRoomStore.getState().muteRequestAt).toBeNull();

    await emit(payload({ type: 'MUTE_REQUEST', version: 3 }));
    expect(useVoiceRoomStore.getState().muteRequestAt).not.toBeNull();
    await emit(payload({ type: 'INVITE_SPEAK', version: 4 }));
    expect(useVoiceRoomStore.getState().inviteSpeakAt).not.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('REMOVED (mình): kết thúc phía máy này với lý do "mời ra" và ngắt media NGAY (VR-06/VR-11)', async () => {
    await emit(payload({ type: 'REMOVED', version: 3 }));
    const state = callStoreApi.get();
    expect([state.phase, state.endedInfo?.reason]).toEqual(['ended', 'REMOVED_BY_HOST']);
    await act(async () => Promise.resolve());
    expect(media.disconnectCalls).toBeGreaterThan(0);
  });

  it('REMOVED của người khác không ảnh hưởng máy này', async () => {
    await emit(payload({ targetUserId: 'lan', type: 'REMOVED' }));
    expect(callStoreApi.get().phase).toBe('active');
  });

  it('HOST_CHANGED: cập nhật chủ phòng; mình là chủ mới → toast "Bạn là chủ phòng"', async () => {
    await emit(payload({ byUserId: 'host', targetUserId: 'me', type: 'HOST_CHANGED', version: 3 }));
    expect(callStoreApi.get().call?.hostId).toBe('me');
    expect(showToast).toHaveBeenCalledWith('info', 'Bạn là chủ phòng');
    await emit(payload({ targetUserId: 'lan', type: 'HOST_CHANGED', version: 4 }));
    expect(callStoreApi.get().call?.hostId).toBe('lan');
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('cùng một tác động tới HAI lần (call:{id} và user:{target}) chỉ xử lý MỘT lần; phòng khác bị bỏ qua', async () => {
    const p = payload({ type: 'SCREEN_SHARE_ENDED', version: 5 });
    await emit(p);
    await emit(p);
    expect(showToast).toHaveBeenCalledTimes(1);
    await emit(payload({ callId: 'phong-khac', type: 'AUDIO_BLOCKED', version: 6 }));
    expect(useVoiceRoomStore.getState().audioBlocked).toBe(false);
  });

  it('VIDEO_DISABLED: tắt camera và ẩn nút camera', async () => {
    useCallMediaStore.getState().patch({ cameraOn: true });
    const spy = jest.spyOn(media, 'setCameraEnabled');
    await emit(payload({ targetUserId: null, type: 'VIDEO_DISABLED' }));
    expect(spy).toHaveBeenCalledWith(false);
    expect(useVoiceRoomStore.getState().videoDisabled).toBe(true);
  });
});
