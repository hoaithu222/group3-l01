import { queryClient } from '@/core/config/query-client';
import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomKeys } from '../api/meeting-room.keys';
import { meetingRoomService } from '../api/meeting-room.service';
import type { RoomSnapshot } from '../api/meeting-room.types';
import { handleHostAction, handleParticipantUpdated } from '../hooks/meeting-room.socket-handlers';
import type { FakeMeetingMedia } from '../media/meeting-media.fake';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, installFakeMedia, setPhase } from './controller-kit';
import { makeBrief, makeServerParticipant, makeSnapshot } from './fixtures';
import { flushMicrotasks } from './hook-wrapper';

/** `call:host-action` (chủ trì tác động lên MÌNH) và `call:participant-updated` (vá ảnh chụp phòng) — app.md §4.3. */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(() => Promise.resolve('dev-1')) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room.service', () => ({
  meetingRoomService: { getBrief: jest.fn(), join: jest.fn(), leave: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn() },
}));

const service = jest.mocked(meetingRoomService);
let media: FakeMeetingMedia;

beforeEach(() => {
  jest.clearAllMocks();
  service.leave.mockResolvedValue(undefined);
  service.getBrief.mockResolvedValue(makeBrief());
  service.snapshot.mockResolvedValue(makeSnapshot());
  media = installFakeMedia();
  setPhase('IN_ROOM');
});

afterEach(cleanupController);

describe('call:host-action', () => {
  const act = (over: Partial<Parameters<typeof handleHostAction>[0]>) =>
    handleHostAction({ byUserId: 'host', callId: 'call1', targetUserId: 'me', type: 'MUTED', ...over }, 'me');

  it('MUTED: toast theo nguồn (mic/camera); tắt mic TẤT CẢ có toast riêng, riêng người ra lệnh thì không', () => {
    act({ source: 'MICROPHONE' });
    expect(showToast).toHaveBeenLastCalledWith('info', 'Chủ trì đã tắt mic của bạn.');
    act({ source: 'CAMERA' });
    expect(showToast).toHaveBeenLastCalledWith('info', 'Chủ trì đã tắt camera của bạn.');
    act({ all: true, targetUserId: null });
    expect(showToast).toHaveBeenLastCalledWith('info', 'Chủ trì đã tắt mic của mọi người.');

    jest.mocked(showToast).mockClear();
    act({ all: true, byUserId: 'me', targetUserId: null });
    act({ source: 'MICROPHONE', targetUserId: 'nguoi-khac' });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('REMOVED (đúng mình) → REMOVED, ngắt media; REMOVED người khác → không đụng', async () => {
    act({ targetUserId: 'nguoi-khac', type: 'REMOVED' });
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');

    act({ type: 'REMOVED' });
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('REMOVED');
  });

  it('ROLE_CHANGED (đúng mình) cập nhật vai trò + toast; của người khác chỉ làm mới ảnh chụp phòng', async () => {
    act({ role: 'CO_HOST', type: 'ROLE_CHANGED' });
    expect(meetingRoomApi.get().role).toBe('CO_HOST');
    expect(showToast).toHaveBeenLastCalledWith('info', 'Bạn là đồng chủ trì của cuộc họp.');

    act({ role: 'MEMBER', type: 'ROLE_CHANGED' });
    expect(meetingRoomApi.get().role).toBe('MEMBER');
    expect(showToast).toHaveBeenLastCalledWith('info', 'Bạn không còn là đồng chủ trì.');

    jest.mocked(showToast).mockClear();
    act({ role: 'CO_HOST', targetUserId: 'nguoi-khac', type: 'ROLE_CHANGED' });
    await flushMicrotasks();
    expect(showToast).not.toHaveBeenCalled();
    expect(meetingRoomApi.get().role).toBe('MEMBER');
  });

  it('LOWER_ALL_HANDS: hạ tay CỦA MÌNH ngay trong store + xoá attribute (idempotent) + báo; không giơ thì không làm gì, không báo', () => {
    const send = jest.spyOn(media, 'setHandRaised');
    act({ targetUserId: null, type: 'LOWER_ALL_HANDS' });
    expect(send).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();

    media.handRaisedAt = '2026-10-01T09:00:00.000Z';
    meetingRoomApi.patch({ handRaisedAt: '2026-10-01T09:00:00.000Z' });
    act({ targetUserId: null, type: 'LOWER_ALL_HANDS' });
    expect(meetingRoomApi.get().handRaisedAt).toBeNull(); // không chờ echo LiveKit
    expect(media.handRaisedAt).toBeNull();
    expect(showToast).toHaveBeenLastCalledWith('info', 'Chủ trì đã hạ tay của mọi người.');
  });

  it('SCREEN_SHARE_REJECTED: dừng chia sẻ + giải thích; loại của p2-03 (INVITE_SPEAK…) bị bỏ qua', () => {
    media.screenShare = true;
    act({ type: 'SCREEN_SHARE_REJECTED' });
    expect(media.screenShare).toBe(false);
    expect(showToast).toHaveBeenLastCalledWith('warning', expect.stringContaining('chia sẻ màn hình'));

    jest.mocked(showToast).mockClear();
    act({ type: 'INVITE_SPEAK' });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('phiên/cuộc gọi khác hoặc chưa đăng nhập → bỏ', () => {
    handleHostAction({ byUserId: 'h', callId: 'callKhac', targetUserId: 'me', type: 'REMOVED' }, 'me');
    handleHostAction({ byUserId: 'h', callId: 'call1', targetUserId: 'me', type: 'REMOVED' }, undefined);
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');
  });
});

describe('call:participant-updated → vá ảnh chụp phòng', () => {
  const KEY = meetingRoomKeys.room('m1');
  const payload = (over: Partial<Parameters<typeof handleParticipantUpdated>[0]['participant']> = {}) => ({
    callId: 'call1',
    participant: { handRaisedAt: null, mutedByHost: false, role: 'MEMBER', state: 'CONNECTED', userId: 'u2', ...over },
    version: 3,
  });

  beforeEach(() => {
    queryClient.setQueryData<RoomSnapshot>(KEY, makeSnapshot({ participants: [makeServerParticipant({ name: 'Bình', userId: 'u2' })] }));
  });

  it('người ĐÃ có: vá vai trò/giơ tay/mutedByHost, giữ tên và giờ vào', () => {
    handleParticipantUpdated(payload({ handRaisedAt: '2026-10-01T09:05:00.000Z', mutedByHost: true, role: 'CO_HOST' }), 'me');
    const patched = queryClient.getQueryData<RoomSnapshot>(KEY)?.participants[0];
    expect(patched).toMatchObject({ handRaisedAt: '2026-10-01T09:05:00.000Z', mutedByHost: true, name: 'Bình', role: 'CO_HOST', userId: 'u2' });
  });

  it('người MỚI (chưa có tên trong ảnh chụp) → tải lại ảnh chụp thay vì thêm dòng thiếu tên', () => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    handleParticipantUpdated(payload({ userId: 'u9' }), 'me');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
    expect(queryClient.getQueryData<RoomSnapshot>(KEY)?.participants).toHaveLength(1);
  });

  it('cập nhật của CHÍNH MÌNH đồng bộ vai trò trong store; phiên khác bị bỏ', () => {
    handleParticipantUpdated(payload({ role: 'CO_HOST', userId: 'me' }), 'me');
    expect(meetingRoomApi.get().role).toBe('CO_HOST');
    handleParticipantUpdated({ ...payload({ role: 'HOST', userId: 'me' }), callId: 'callKhac' }, 'me');
    expect(meetingRoomApi.get().role).toBe('CO_HOST');
  });
});
