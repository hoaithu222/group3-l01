import { useAuthStore } from '@/shell/store/slices/auth';

import { meetingRoomService } from '../api/meeting-room.service';
import { beginMeeting, submitJoin } from '../hooks/meeting-room.join';
import type { FakeMeetingMedia } from '../media/meeting-media.fake';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, HOST_BRIEF, installFakeMedia, openMeeting, WAITING_RESULT } from './controller-kit';
import { makeBrief, makeJoined, makeSnapshot } from './fixtures';
import { apiError, flushMicrotasks } from './hook-wrapper';

/**
 * Vào phòng (app.md §4.1, §8): `start`/`join` → WAITING_FOR_HOST | IN_LOBBY | JOINED; mã lỗi → màn "không vào được"/hộp thoại chuyển cuộc
 * gọi; `RES_003` tải lại chi tiết rồi thử lại đúng một lần. Service giả, LiveKit = `FakeMeetingMedia`.
 */
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(() => Promise.resolve('dev-1')) }));
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room.service', () => ({
  meetingRoomService: { getBrief: jest.fn(), join: jest.fn(), leave: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn(), start: jest.fn() },
}));

const service = jest.mocked(meetingRoomService);
let media: FakeMeetingMedia;

beforeEach(() => {
  jest.clearAllMocks();
  service.join.mockReset();
  service.start.mockReset();
  service.leave.mockResolvedValue(undefined);
  service.renewToken.mockResolvedValue({ expiresAt: '2099-01-01T00:00:00.000Z', livekitUrl: 'ws://lk', token: 'fresh' });
  service.snapshot.mockResolvedValue(makeSnapshot());
  service.getBrief.mockResolvedValue(makeBrief());
  useAuthStore.setState({ user: { id: 'me', name: 'An Nguyễn' } as never });
  media = installFakeMedia();
});

afterEach(cleanupController);

describe('beginMeeting', () => {
  it('phiên mới: state sạch, tên hiển thị mặc định = tên người dùng', () => {
    meetingRoomApi.reset();
    expect(beginMeeting('m1')).toBe('fresh');
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: 'm1', phase: 'PREJOIN', preJoin: { cam: false, displayName: 'An Nguyễn', mic: false } });
  });

  it('mở lại ĐÚNG phòng đang có (từ MiniBar/nút "Vào phòng"): giữ nguyên phiên, bỏ thu nhỏ', () => {
    openMeeting();
    meetingRoomApi.patch({ minimized: true, phase: 'IN_ROOM' });
    expect(beginMeeting('m1')).toBe('resume');
    expect(meetingRoomApi.get()).toMatchObject({ minimized: false, phase: 'IN_ROOM' });
  });

  it('đang ở phòng KHÁC còn sống → "switch" (cần hỏi), không đụng state; phiên cũ đã chết → dọn và mở mới', () => {
    openMeeting();
    meetingRoomApi.patch({ phase: 'IN_ROOM' });
    expect(beginMeeting('m2')).toBe('switch');
    expect(meetingRoomApi.get().meetingId).toBe('m1');

    meetingRoomApi.patch({ phase: 'ENDED' });
    expect(beginMeeting('m2')).toBe('fresh');
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: 'm2', phase: 'PREJOIN' });
  });
});

describe('submitJoin', () => {
  it('người tham dự: gọi `join` kèm deviceId + tên; chủ trì chưa bắt đầu → phòng chờ có giờ bắt đầu và độ lệch giờ server', async () => {
    openMeeting();
    service.join.mockResolvedValue({ ...WAITING_RESULT });
    await submitJoin();

    expect(service.join).toHaveBeenCalledWith('m1', { deviceId: 'dev-1', displayName: 'An Nguyễn', force: undefined });
    expect(service.start).not.toHaveBeenCalled();
    expect(meetingRoomApi.get()).toMatchObject({ busy: false, phase: 'WAITING_FOR_HOST', waiting: { joinOpensAt: WAITING_RESULT.joinOpensAt, startAt: WAITING_RESULT.startAt } });
    expect(meetingRoomApi.get().serverOffsetMs).toBeCloseTo(Date.parse(WAITING_RESULT.serverNow) - Date.now(), -3);
  });

  it('tên hiển thị để trống → không gửi `displayName` (server dùng tên tài khoản)', async () => {
    openMeeting();
    meetingRoomApi.patch({ preJoin: { ...meetingRoomApi.get().preJoin, displayName: '   ' } });
    service.join.mockResolvedValue({ ...WAITING_RESULT });
    await submitJoin();
    expect(service.join).toHaveBeenCalledWith('m1', expect.objectContaining({ displayName: undefined }));
  });

  it('chủ trì + canStart: `start` kèm expectedVersion; JOINED → nối media → IN_ROOM; chi tiết mới từ `start` được áp', async () => {
    openMeeting(HOST_BRIEF);
    service.snapshot.mockResolvedValue(makeSnapshot({ myRole: 'HOST' })); // ảnh chụp phòng đối soát vai trò của mình
    service.start.mockResolvedValue({ ...makeJoined({ role: 'HOST' }), meeting: makeBrief({ startedAt: '2026-10-01T09:00:00.000Z', status: 'LIVE', version: 8 }) });
    await submitJoin();
    await flushMicrotasks();

    expect(service.start).toHaveBeenCalledWith('m1', expect.objectContaining({ deviceId: 'dev-1', expectedVersion: 7 }));
    expect(service.join).not.toHaveBeenCalled();
    expect(media.connectCalls).toHaveLength(1);
    expect(meetingRoomApi.get()).toMatchObject({ callId: 'call1', phase: 'IN_ROOM', role: 'HOST', startedAt: '2026-10-01T09:00:00.000Z', waiting: null });
  });

  it('IN_LOBBY (chủ trì bật phòng chờ) → pha phòng chờ, chưa nối media', async () => {
    openMeeting();
    service.join.mockResolvedValue({ meetingId: 'm1', requestedAt: '2026-10-01T09:01:00.000Z', serverNow: '2026-10-01T09:01:00.000Z', state: 'IN_LOBBY' });
    await submitJoin();
    expect(meetingRoomApi.get().phase).toBe('IN_LOBBY');
    expect(media.connectCalls).toHaveLength(0);
  });

  it.each(['MEET_007', 'MEET_013', 'MEET_017', 'MEET_018', 'MEET_009'])('%s → màn "không vào được" đúng mã (không phải toast)', async (code) => {
    openMeeting();
    service.join.mockRejectedValue(apiError(409, code));
    await submitJoin();
    expect(meetingRoomApi.get()).toMatchObject({ blockedCode: code, busy: false, phase: 'BLOCKED' });
  });

  it('CALL_004 → hộp thoại chuyển cuộc gọi (chưa đổi pha); đồng ý → gọi lại với `force: true`', async () => {
    openMeeting();
    service.join.mockRejectedValueOnce(apiError(409, 'CALL_004', { sameCallOtherDevice: false }));
    await submitJoin();
    expect(meetingRoomApi.get()).toMatchObject({ busyConflict: { sameDevice: false }, phase: 'PREJOIN' });

    service.join.mockResolvedValueOnce({ ...WAITING_RESULT });
    await submitJoin({ force: true });
    expect(service.join).toHaveBeenLastCalledWith('m1', expect.objectContaining({ force: true }));
    expect(meetingRoomApi.get()).toMatchObject({ busyConflict: null, phase: 'WAITING_FOR_HOST' });
  });

  it('mất mạng → lỗi trên pre-join (nút "Thử lại"), không phải màn chặn', async () => {
    openMeeting();
    service.join.mockRejectedValue(Object.assign(new Error('Network Error'), { isAxiosError: true }));
    await submitJoin();
    expect(meetingRoomApi.get()).toMatchObject({ phase: 'PREJOIN' });
    expect(meetingRoomApi.get().error).toMatch(/kết nối mạng/);
  });

  it('đang bận (busy) hoặc chưa có meetingId → không gọi API lần hai', async () => {
    openMeeting();
    meetingRoomApi.patch({ busy: true });
    await submitJoin();
    meetingRoomApi.reset();
    await submitJoin();
    expect(service.join).not.toHaveBeenCalled();
    expect(service.start).not.toHaveBeenCalled();
  });
});
