import { FakeCallMedia } from '@/core/media/call-media.fake';
import { setCallMediaForTests } from '@/core/media/call-media.registry';
import { MediaUnavailableError } from '@/core/media/call-media.types';
import { showToast } from '@/shared/utils/toast.utils';

import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroJoinResult } from '../api/pomodoro.types';
import {
  connectPomodoroSession,
  leavePomodoroRoom,
  RECONNECT_GRACE_MS,
  teardownPomodoroSession,
} from '../hooks/pomodoro-session.controller';
import { resetPomodoroStores } from '../hooks/reset-pomodoro-stores';
import { usePomodoroStore } from '../store/pomodoro.store';
import { makeSnapshot } from './fixtures';

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

/** Controller media ngoài React: vào phòng với mic/camera TẮT, nối lại có hạn 30 s, bị đá thì chỉ dọn phía máy này, trạng thái mic lấy từ SDK. */

const room = () => usePomodoroStore.getState().room;
const leaveSpy = jest.spyOn(pomodoroService, 'leave');
const renewSpy = jest.spyOn(pomodoroService, 'renewToken');

const JOIN: PomodoroJoinResult = {
  call: { id: 'call1' },
  expiresAt: '2026-09-25T10:10:00.000Z',
  livekitUrl: 'wss://lk.example',
  serverNow: '2026-09-25T10:00:00.000Z',
  snapshot: makeSnapshot(),
  token: 'tok-1',
};

let media: FakeCallMedia;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  media = new FakeCallMedia();
  setCallMediaForTests(media);
  usePomodoroStore.getState().reset();
  leaveSpy.mockResolvedValue(undefined);
});

afterEach(async () => {
  await teardownPomodoroSession();
  setCallMediaForTests(null);
  jest.useRealTimers();
});

it('vào phòng với mic/camera TẮT (không xin quyền) và bật loa ngoài', async () => {
  await connectPomodoroSession(JOIN, 'ch1');

  expect(media.connectCalls).toEqual([{ audio: false, token: 'tok-1', url: 'wss://lk.example', video: false }]);
  expect(room()).toMatchObject({ callId: 'call1', channelId: 'ch1', connection: 'connected', failed: false, micOn: false, speakerOn: true });
});

it('kết nối lỗi ⇒ thử lại với TOKEN MỚI (token TTL ngắn), không quá 3 lần', async () => {
  renewSpy.mockResolvedValue({ expiresAt: 'x', livekitUrl: 'wss://lk.example', token: 'tok-2' });
  const connect = jest.spyOn(media, 'connect').mockRejectedValueOnce(new Error('mạng')).mockImplementation(FakeCallMedia.prototype.connect.bind(media));

  const done = connectPomodoroSession(JOIN, 'ch1');
  await jest.advanceTimersByTimeAsync(1500);
  await done;

  expect(connect).toHaveBeenCalledTimes(2);
  expect(connect.mock.calls[1]?.[0]).toMatchObject({ token: 'tok-2' });
  expect(room().connection).toBe('connected');
});

it('hết 3 lần thử ⇒ failed (UI hiện "Thử lại"), không kẹt ở connecting', async () => {
  renewSpy.mockRejectedValue(new Error('mạng'));
  jest.spyOn(media, 'connect').mockRejectedValue(new Error('mạng'));

  const done = connectPomodoroSession(JOIN, 'ch1');
  await jest.advanceTimersByTimeAsync(10_000);
  await done;

  expect(room()).toMatchObject({ connection: 'disconnected', failed: true });
});

it('thiếu module native (Expo Go) ⇒ báo cần dev-client và failed, không thử lại', async () => {
  const connect = jest.spyOn(media, 'connect').mockRejectedValue(new MediaUnavailableError());
  await connectPomodoroSession(JOIN, 'ch1');
  expect(connect).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledWith('error', expect.stringContaining('dev-client'));
  expect(room().failed).toBe(true);
});

it('mất kết nối quá 30 s ⇒ tự rời phòng (báo server + ngắt media); nối lại kịp thì ở lại', async () => {
  await connectPomodoroSession(JOIN, 'ch1');
  media.emit({ type: 'reconnecting' });
  expect(room().connection).toBe('reconnecting');

  await jest.advanceTimersByTimeAsync(RECONNECT_GRACE_MS - 1000);
  media.emit({ type: 'reconnected' });
  await jest.advanceTimersByTimeAsync(RECONNECT_GRACE_MS);
  expect(room().connection).toBe('connected');
  expect(leaveSpy).not.toHaveBeenCalled();

  media.emit({ type: 'reconnecting' });
  await jest.advanceTimersByTimeAsync(RECONNECT_GRACE_MS + 10);
  expect(leaveSpy).toHaveBeenCalledWith('call1');
  expect(media.disconnectCalls).toBeGreaterThan(0);
  expect(room().callId).toBeNull();
  expect(showToast).toHaveBeenCalledWith('warning', expect.stringContaining('Mất kết nối'));
});

it('bị đá / cùng tài khoản vào máy khác / phòng đóng: chỉ dọn phía máy này — KHÔNG gọi leave (sẽ gỡ luôn máy mới)', async () => {
  await connectPomodoroSession(JOIN, 'ch1');
  media.emit({ reason: 'duplicate-identity', type: 'disconnected' });
  await jest.advanceTimersByTimeAsync(10);

  expect(room().callId).toBeNull();
  expect(leaveSpy).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith('info', 'Bạn đã vào phòng này từ thiết bị khác.');
});

it('ngắt lạ (error) ⇒ failed để UI cho thử lại; ngắt do chính mình (client) thì im lặng', async () => {
  await connectPomodoroSession(JOIN, 'ch1');
  media.emit({ reason: 'error', type: 'disconnected' });
  expect(room()).toMatchObject({ connection: 'disconnected', failed: true });
});

it('mic tắt do máy chủ thu quyền (SDK báo local micEnabled=false) ⇒ UI phản chiếu, client không tự tắt', async () => {
  await connectPomodoroSession(JOIN, 'ch1');
  usePomodoroStore.getState().patchRoom({ micOn: true });
  media.emit({
    participants: [{ cameraEnabled: false, identity: 'me', isLocal: true, isSpeaking: false, micEnabled: false, videoRef: null }],
    type: 'participants',
  });
  expect(room().micOn).toBe(false);
  expect(room().participants).toHaveLength(1);
});

it('leavePomodoroRoom: ngắt media rồi báo server; resetPomodoroStores (đăng xuất) ngắt media và xoá store', async () => {
  await connectPomodoroSession(JOIN, 'ch1');
  await leavePomodoroRoom();
  expect(media.getState()).toBe('disconnected');
  expect(leaveSpy).toHaveBeenCalledWith('call1');

  await connectPomodoroSession(JOIN, 'ch1');
  usePomodoroStore.getState().setGoalDraft('s1', 'nháp');
  await resetPomodoroStores();
  expect(media.getState()).toBe('disconnected');
  expect(room().callId).toBeNull();
  expect(usePomodoroStore.getState().goalDraft).toEqual({});
});
