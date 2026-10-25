import { act, renderHook } from '@testing-library/react-native';

import { useAuthStore } from '@/shell/store/slices/auth';

import { meetingRoomHostService } from '../api/meeting-room-host.service';
import { meetingRoomService } from '../api/meeting-room.service';
import { useMeetingJoinFlow } from '../hooks/useMeetingJoinFlow';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { meetingRoomApi } from '../store/meeting-room.store';
import { HOST_BRIEF, WAITING_RESULT } from './controller-kit';
import { makeBrief, makeSnapshot } from './fixtures';
import { apiError, makeTestQueryClient, makeWrapper } from './hook-wrapper';

/**
 * `useMeetingJoinFlow` (app.md §2, §4.1, §8): mở phiên cho cuộc họp, nhãn nút chính theo `myActions`, lỗi tải chi tiết (offline/404),
 * chuyển phòng khi đang ở cuộc họp khác, và các bước "bấm nút chính / chỉ nghe / đồng ý chuyển cuộc gọi".
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
const settle = () => act(async () => jest.advanceTimersByTimeAsync(1500));

async function setup(meetingId = 'm1') {
  const client = makeTestQueryClient();
  const hook = await renderHook(() => useMeetingJoinFlow(meetingId), { wrapper: makeWrapper(client) });
  await settle();
  return { client, ...hook };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  meetingRoomApi.reset();
  service.join.mockReset();
  service.start.mockReset();
  service.getBrief.mockReset().mockResolvedValue(makeBrief());
  service.leave.mockResolvedValue(undefined);
  service.snapshot.mockResolvedValue(makeSnapshot());
  jest.mocked(meetingRoomHostService.cancelMyRequest).mockResolvedValue(undefined);
  useAuthStore.setState({ user: { id: 'me', name: 'An' } as never });
  setMeetingMediaForTests(new FakeMeetingMedia());
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
  jest.useRealTimers();
});

describe('useMeetingJoinFlow', () => {
  it('mở phiên: store có meetingId, chi tiết vào store; nhãn nút chính theo myActions (Tham gia / Xin vào / Bắt đầu cuộc họp)', async () => {
    const { result } = await setup();
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: 'm1', phase: 'PREJOIN' });
    expect(result.current).toMatchObject({ briefState: 'ready', needsSwitch: false, primaryLabel: 'Tham gia' });
    expect(result.current.brief?.title).toBe('Họp giao ban');
  });

  it.each([
    ['chủ trì chưa bắt đầu', 'Bắt đầu cuộc họp', HOST_BRIEF],
    ['sẽ vào phòng chờ', 'Xin vào', makeBrief({ myActions: { canEnd: false, canJoin: true, canRecord: false, canStart: false, joinVia: 'LOBBY' } })],
  ])('%s → nút chính "%s"', async (_name, label, brief) => {
    service.getBrief.mockResolvedValue(brief);
    const { result } = await setup();
    expect(result.current.primaryLabel).toBe(label);
  });

  it('mất mạng lúc tải chi tiết → "offline" có thể thử lại; thử lại được → sẵn sàng', async () => {
    service.getBrief.mockRejectedValue(Object.assign(new Error('Network Error'), { isAxiosError: true }));
    const { result } = await setup();
    expect(result.current).toMatchObject({ brief: null, briefState: 'offline' });

    service.getBrief.mockResolvedValue(makeBrief());
    await act(async () => result.current.retryBrief());
    await settle();
    expect(result.current.briefState).toBe('ready');
  });

  it('cuộc họp không tồn tại/mất quyền (404) → màn "không còn khả dụng" (BLOCKED GONE)', async () => {
    service.getBrief.mockRejectedValue(apiError(404, 'MEET_001'));
    await setup();
    expect(meetingRoomApi.get()).toMatchObject({ blockedCode: 'GONE', phase: 'BLOCKED' });
  });

  it('bấm nút chính → `join`; "Tham gia chỉ để nghe" tắt mic/camera rồi vào; đồng ý chuyển cuộc gọi → `force: true`', async () => {
    service.join.mockResolvedValue({ ...WAITING_RESULT });
    const { result } = await setup();

    await act(async () => result.current.submit());
    expect(service.join).toHaveBeenCalledWith('m1', expect.objectContaining({ deviceId: 'dev-1', displayName: 'An' }));
    expect(meetingRoomApi.get().phase).toBe('WAITING_FOR_HOST');

    meetingRoomApi.patch({ phase: 'PREJOIN', preJoin: { ...meetingRoomApi.get().preJoin, cam: true, mic: true } });
    await act(async () => result.current.submitListenOnly());
    expect(meetingRoomApi.get().preJoin).toMatchObject({ cam: false, listenOnly: true, mic: false });

    await act(async () => result.current.confirmBusyConflict());
    expect(service.join).toHaveBeenLastCalledWith('m1', expect.objectContaining({ force: true }));
  });

  it('đang ở phòng KHÁC còn sống → needsSwitch; đồng ý chuyển: rời phòng cũ rồi mở phiên mới', async () => {
    meetingRoomApi.patch({ meetingId: 'cu', phase: 'IN_ROOM' });
    const { result } = await setup('moi');
    expect(result.current).toMatchObject({ brief: null, needsSwitch: true });
    expect(meetingRoomApi.get().meetingId).toBe('cu');

    await act(async () => result.current.confirmSwitch());
    await settle();
    expect(service.leave).toHaveBeenCalledWith('cu', undefined);
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: 'moi', phase: 'PREJOIN' });
    expect(result.current.needsSwitch).toBe(false);
  });
});
