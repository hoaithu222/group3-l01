import { meetingRoomHostService } from '../api/meeting-room-host.service';
import { meetingRoomService } from '../api/meeting-room.service';
import { JOIN_RETRY_DEBOUNCE_MS, JOIN_RETRY_MAX } from '../constants/meeting-room.constants';
import { refreshBrief } from '../hooks/meeting-room.brief';
import { cancelLobbyRequest, requestRejoin, submitJoin } from '../hooks/meeting-room.join';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, HOST_BRIEF, installFakeMedia, openMeeting, WAITING_RESULT } from './controller-kit';
import { makeBrief, makeJoined, makeSnapshot } from './fixtures';
import { apiError, flushMicrotasks } from './hook-wrapper';

/**
 * Gọi `join` lại sau `meeting:started`/ADMITTED (app.md §4.1 bước 4): gộp nhịp 300 ms, tối đa 3 lần; huỷ yêu cầu lobby; làm mới chi tiết; và
 * `RES_003` (chi tiết cũ) tải lại rồi thử lại ĐÚNG một lần.
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
jest.mock('../api/meeting-room-host.service', () => ({ meetingRoomHostService: { cancelMyRequest: jest.fn() } }));

const service = jest.mocked(meetingRoomService);
const host = jest.mocked(meetingRoomHostService);

beforeEach(() => {
  jest.clearAllMocks();
  service.join.mockReset();
  service.start.mockReset();
  service.leave.mockResolvedValue(undefined);
  service.renewToken.mockResolvedValue({ expiresAt: '2099-01-01T00:00:00.000Z', livekitUrl: 'ws://lk', token: 'fresh' });
  service.snapshot.mockResolvedValue(makeSnapshot());
  service.getBrief.mockResolvedValue(makeBrief());
  host.cancelMyRequest.mockResolvedValue(undefined);
  installFakeMedia();
});

afterEach(cleanupController);

describe('requestRejoin', () => {
  beforeEach(() => {
    openMeeting();
    meetingRoomApi.patch({ phase: 'WAITING_FOR_HOST' });
    service.join.mockResolvedValue({ ...WAITING_RESULT });
  });

  it('gộp nhịp 300 ms: nhiều tín hiệu sát nhau chỉ gọi MỘT lần', async () => {
    requestRejoin();
    requestRejoin();
    requestRejoin();
    await jest.advanceTimersByTimeAsync(JOIN_RETRY_DEBOUNCE_MS - 1);
    expect(service.join).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2);
    expect(service.join).toHaveBeenCalledTimes(1);
  });

  it(`tối đa ${JOIN_RETRY_MAX} lần mỗi đợt chờ`, async () => {
    for (let i = 0; i < JOIN_RETRY_MAX + 2; i += 1) {
      requestRejoin();
      await jest.advanceTimersByTimeAsync(JOIN_RETRY_DEBOUNCE_MS + 1);
    }
    expect(service.join).toHaveBeenCalledTimes(JOIN_RETRY_MAX);
  });

  it('không chạy khi đã rời phòng chờ (tín hiệu tới trễ lúc đã vào phòng)', async () => {
    meetingRoomApi.patch({ phase: 'IN_ROOM' });
    requestRejoin();
    await jest.advanceTimersByTimeAsync(JOIN_RETRY_DEBOUNCE_MS + 1);
    expect(service.join).not.toHaveBeenCalled();
  });

  it('gọi lại thành công (JOINED) → nối media → vào phòng', async () => {
    service.join.mockResolvedValueOnce(makeJoined());
    requestRejoin();
    await jest.advanceTimersByTimeAsync(JOIN_RETRY_DEBOUNCE_MS + 1);
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');
  });
});

describe('RES_003 — chi tiết cũ', () => {
  it('tải lại chi tiết rồi thử lại ĐÚNG một lần (chi tiết mới không còn canStart ⇒ vào bằng `join`)', async () => {
    openMeeting(HOST_BRIEF);
    service.getBrief.mockResolvedValue(makeBrief({ status: 'LIVE', version: 9 }));
    service.start.mockRejectedValueOnce(apiError(409, 'RES_003'));
    service.join.mockResolvedValueOnce({ ...WAITING_RESULT });
    await submitJoin();

    expect(service.getBrief).toHaveBeenCalledWith('m1');
    expect(service.join).toHaveBeenCalledTimes(1);
    expect(meetingRoomApi.get().phase).toBe('WAITING_FOR_HOST');
  });

  it('vẫn lệch sau lần thử lại → báo "vừa thay đổi", không lặp vô hạn', async () => {
    openMeeting(HOST_BRIEF);
    service.getBrief.mockResolvedValue(HOST_BRIEF);
    service.start.mockRejectedValue(apiError(409, 'RES_003'));
    await submitJoin();

    expect(service.start).toHaveBeenCalledTimes(2);
    expect(meetingRoomApi.get().error).toMatch(/vừa thay đổi/);
  });
});

describe('cancelLobbyRequest / refreshBrief', () => {
  it('huỷ yêu cầu: DELETE lobby/me rồi về pre-join (xin lại được); lỗi mạng cũng về pre-join', async () => {
    openMeeting();
    meetingRoomApi.patch({ phase: 'IN_LOBBY' });
    await cancelLobbyRequest();
    expect(host.cancelMyRequest).toHaveBeenCalledWith('m1');
    expect(meetingRoomApi.get()).toMatchObject({ busy: false, phase: 'PREJOIN' });

    meetingRoomApi.patch({ phase: 'IN_LOBBY' });
    host.cancelMyRequest.mockRejectedValueOnce(new Error('offline'));
    await cancelLobbyRequest();
    expect(meetingRoomApi.get().phase).toBe('PREJOIN');
  });

  it('refreshBrief: ghi vào store + cache và làm mới chi tiết của lịch họp; lỗi → null, không ném', async () => {
    openMeeting();
    service.getBrief.mockResolvedValueOnce(makeBrief({ startedAt: '2026-10-01T09:00:00.000Z', title: 'Đổi tên' }));
    const brief = await refreshBrief('m1');
    expect(brief?.title).toBe('Đổi tên');
    expect(meetingRoomApi.get()).toMatchObject({ startedAt: '2026-10-01T09:00:00.000Z' });
    expect(meetingRoomApi.get().brief?.title).toBe('Đổi tên');

    service.getBrief.mockRejectedValueOnce(new Error('x'));
    await expect(refreshBrief('m1')).resolves.toBeNull();
  });
});
