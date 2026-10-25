import { FakeCallMedia } from '@/core/media/call-media.fake';
import { setCallMediaForTests } from '@/core/media/call-media.registry';

import { resetCallStores } from '../../hooks/reset-call-stores';
import { useCallMediaStore } from '../../store/call-media.store';
import { callStoreApi } from '../../store/call.store';
import { voiceJoinAttempts, voiceJoinPrefs } from '../store/voice-join.prefs';
import { useVoiceRoomStore } from '../store/voice-room.store';
import { enterRoom } from './helpers';

/**
 * Đăng xuất / phiên chết (`wipeUserData`, bước `calls`): dữ liệu phòng thoại của người trước không được lọt sang người sau — lời nhắc của
 * chủ phòng, lựa chọn "để nghe"/camera, `clientCallId` thử lại — và kết nối LiveKit phải ngắt.
 */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
}));

afterEach(() => setCallMediaForTests(null));

describe('resetCallStores — phòng thoại kênh', () => {
  it('dọn state phòng, lựa chọn vào phòng và khoá thử lại; ngắt media', async () => {
    const media = new FakeCallMedia();
    setCallMediaForTests(media);
    enterRoom();
    useVoiceRoomStore.getState().patch({ audioBlocked: true, inviteSpeakAt: 1, muteRequestAt: 2, videoDisabled: true });
    useCallMediaStore.getState().patch({ micOn: true });
    voiceJoinPrefs.set({ camera: true, listenOnly: true });
    voiceJoinAttempts.set('ch1:AUDIO', 'client-call-id');

    resetCallStores();
    await Promise.resolve(); // teardownCallSession chạy nền
    await Promise.resolve();

    expect(callStoreApi.get().phase).toBe('idle');
    expect(useVoiceRoomStore.getState()).toMatchObject({ audioBlocked: false, inviteSpeakAt: null, muteRequestAt: null, videoDisabled: false });
    expect(useCallMediaStore.getState().micOn).toBe(false);
    expect(voiceJoinPrefs.take()).toEqual({ camera: false, listenOnly: false });
    expect(voiceJoinAttempts.get('ch1:AUDIO')).toBeUndefined();
    expect(media.disconnectCalls).toBeGreaterThan(0);
  });

  it('idempotent: gọi hai lần liên tiếp (đường đăng xuất chạy `wipeUserData` nhiều lần) không lỗi', () => {
    setCallMediaForTests(new FakeCallMedia());
    expect(() => {
      resetCallStores();
      resetCallStores();
    }).not.toThrow();
  });
});
