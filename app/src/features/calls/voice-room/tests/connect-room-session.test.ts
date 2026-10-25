import { FakeCallMedia } from '@/core/media/call-media.fake';
import { setCallMediaForTests } from '@/core/media/call-media.registry';
import { ensureCameraPermission, ensureMicrophonePermission } from '@/core/media/permissions';

import { connectCallSession, teardownCallSession } from '../../hooks/call-session.controller';
import { useCallMediaStore } from '../../store/call-media.store';
import { callStoreApi } from '../../store/call.store';
import { useVoiceRoomStore } from '../store/voice-room.store';
import { makeRoomCall } from './helpers';

/** Bước MEDIA của phòng thoại (VR-02/VR-07): "để nghe" không xin quyền mic; xin lúc bật; camera tắt sau khi rời. LiveKit thật = bản giả. */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../../api/calls.service', () => ({ callsService: { getMyActive: jest.fn(), renewToken: jest.fn() } }));

const token = { expiresAt: '2026-09-25T10:10:00.000Z', livekitUrl: 'wss://lk', token: 'jwt' };
let media: FakeCallMedia;

beforeEach(() => {
  jest.clearAllMocks();
  media = new FakeCallMedia();
  setCallMediaForTests(media);
  useCallMediaStore.getState().reset();
  callStoreApi.dispatch({ type: 'RESET' });
  callStoreApi.dispatch({ clientCallId: 'c', type: 'START_BEGIN' });
  callStoreApi.dispatch({ call: makeRoomCall(), joined: false, token, type: 'START_OK' });
});

afterEach(async () => {
  await teardownCallSession();
  setCallMediaForTests(null);
});

describe('connectCallSession — phòng thoại kênh', () => {
  it('"Tham gia để nghe": KHÔNG xin quyền mic/camera, vào với mic tắt, không báo "thiếu quyền micro", mặc định loa ngoài', async () => {
    await connectCallSession('call1', token, 'AUDIO', { camera: false, listenOnly: true });
    expect(ensureMicrophonePermission).not.toHaveBeenCalled();
    expect(ensureCameraPermission).not.toHaveBeenCalled();
    expect(media.connectCalls[0]).toMatchObject({ audio: false, video: false });
    expect(useCallMediaStore.getState()).toMatchObject({ connection: 'connected', micDenied: false, micOn: false, speakerOn: true });
    expect(callStoreApi.get().phase).toBe('active'); // "Đã tham gia" chỉ khi media kết nối thành công
  });

  it('"Tham gia": xin mic SAU khi phòng đã tạo; camera chỉ xin khi người dùng đã chọn bật', async () => {
    await connectCallSession('call1', token, 'AUDIO', { camera: false, listenOnly: false });
    expect(ensureMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(ensureCameraPermission).not.toHaveBeenCalled();
    expect(media.connectCalls[0]).toMatchObject({ audio: true, video: false });
    await teardownCallSession();

    callStoreApi.dispatch({ type: 'RESET' });
    callStoreApi.dispatch({ clientCallId: 'c', type: 'START_BEGIN' });
    callStoreApi.dispatch({ call: makeRoomCall(), joined: false, token, type: 'START_OK' });
    await connectCallSession('call1', token, 'VIDEO', { camera: true, listenOnly: false });
    expect(ensureCameraPermission).toHaveBeenCalledTimes(1);
    expect(media.connectCalls[1]).toMatchObject({ audio: true, video: true });
  });

  it('bị từ chối mic: vẫn vào phòng để nghe, có ghi chú "chỉ nghe được"', async () => {
    jest.mocked(ensureMicrophonePermission).mockResolvedValueOnce('denied');
    await connectCallSession('call1', token, 'AUDIO', { camera: false, listenOnly: false });
    expect(media.connectCalls[0]).toMatchObject({ audio: false });
    expect(useCallMediaStore.getState().micDenied).toBe(true);
    expect(callStoreApi.get().phase).toBe('active');
  });

  it('VR-07: rời phòng → ngắt media (dừng mọi track, không giữ camera) và xoá lời nhắc của chủ phòng', async () => {
    await connectCallSession('call1', token, 'VIDEO', { camera: true, listenOnly: false });
    useVoiceRoomStore.getState().patch({ audioBlocked: true, muteRequestAt: 1 });
    await teardownCallSession();
    expect(media.disconnectCalls).toBeGreaterThan(0);
    expect(media.getState()).toBe('disconnected');
    expect(useCallMediaStore.getState()).toMatchObject({ cameraOn: false, connection: 'idle', micOn: false });
    expect(useVoiceRoomStore.getState()).toMatchObject({ audioBlocked: false, muteRequestAt: null });
  });

  it('cuộc gọi RING (không có tuỳ chọn phòng) giữ hành vi cũ: xin mic, camera theo mediaKind', async () => {
    await connectCallSession('call1', token, 'VIDEO');
    expect(ensureMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(ensureCameraPermission).toHaveBeenCalledTimes(1);
    expect(useCallMediaStore.getState().speakerOn).toBe(false); // loa ngoài mặc định CHỈ cho phòng nhiều người
  });

  it('bị ngắt vì cùng tài khoản vào từ máy khác (DUPLICATE_IDENTITY) → kết thúc với lý do "đã chuyển thiết bị"', async () => {
    await connectCallSession('call1', token, 'AUDIO', { camera: false, listenOnly: false });
    media.emit({ reason: 'duplicate-identity', type: 'disconnected' });
    expect(callStoreApi.get()).toMatchObject({ phase: 'ended', endedInfo: { reason: 'MOVED_DEVICE' } });
  });
});
