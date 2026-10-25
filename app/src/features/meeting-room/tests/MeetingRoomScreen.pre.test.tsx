import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Redirect, router } from 'expo-router';

import { useAuthStore } from '@/shell/store/slices/auth';

import { meetingRoomHostService } from '../api/meeting-room-host.service';
import { meetingRoomService } from '../api/meeting-room.service';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { MeetingRoomScreen } from '../screens/MeetingRoomScreen';
import { meetingRoomApi } from '../store/meeting-room.store';
import { HOST_BRIEF, WAITING_RESULT } from './controller-kit';
import { makeBrief, makeSnapshot } from './fixtures';
import { apiError, installMicrotaskQueryNotifications } from './hook-wrapper';
import { renderScreen } from './screen-helpers';

/**
 * Màn phòng họp — các pha TRƯỚC/SAU phòng (app.md §3.1, §3.2): hàng rào đăng nhập, tải chi tiết, pre-join → chờ chủ trì/lobby/không vào được,
 * hộp thoại chuyển cuộc gọi (`CALL_004`) và chuyển phòng, màn "đã kết thúc"/"bị mời ra". Component thuần đã có test riêng — ở đây kiểm việc NỐI.
 */
jest.mock('@/core/config/env.config', () => {
  const actual = jest.requireActual<{ appConfig: Record<string, unknown> }>('@/core/config/env.config');
  return { ...actual, appConfig: { ...actual.appConfig, authEnabled: true } };
});
jest.mock('expo-router', () => ({ Redirect: jest.fn(() => null), router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(() => Promise.resolve()), deactivateKeepAwake: jest.fn(() => Promise.resolve()) }));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(() => Promise.resolve('dev-1')) }));
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/core/socket', () => ({
  SocketEvent: jest.requireActual('@/core/socket/socket.events').SocketEvent,
  onRoomResync: jest.fn(() => () => undefined),
  useRoomSubscription: jest.fn(() => ({ status: 'joined' })),
  useSocketEvent: jest.fn(),
}));
jest.mock('@/features/chat', () => ({ ChatRoom: () => null, useChatScope: () => ({}) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../hooks/useMicLevel', () => ({ useMicLevel: jest.fn(() => 0) }));
jest.mock('../api/meeting-room.service', () => ({
  meetingRoomService: { getBrief: jest.fn(), join: jest.fn(), leave: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn(), start: jest.fn() },
}));
jest.mock('../api/meeting-room-host.service', () => ({ meetingRoomHostService: { cancelMyRequest: jest.fn() } }));

installMicrotaskQueryNotifications();

const service = jest.mocked(meetingRoomService);

const open = (phase: Parameters<typeof meetingRoomApi.patch>[0]['phase'], extra: Parameters<typeof meetingRoomApi.patch>[0] = {}) =>
  meetingRoomApi.patch({ brief: makeBrief(), meetingId: 'm1', phase, ...extra });
const press = async (name: string) => fireEvent.press(await screen.findByRole('button', { name }));

beforeEach(() => {
  jest.clearAllMocks();
  meetingRoomApi.reset();
  service.join.mockReset();
  service.getBrief.mockReset().mockResolvedValue(makeBrief());
  service.leave.mockResolvedValue(undefined);
  service.snapshot.mockResolvedValue(makeSnapshot());
  jest.mocked(meetingRoomHostService.cancelMyRequest).mockResolvedValue(undefined);
  jest.mocked(router.canGoBack).mockReturnValue(true);
  useAuthStore.setState({ status: 'authenticated', user: { id: 'me', name: 'An' } as never });
  setMeetingMediaForTests(new FakeMeetingMedia());
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
});

describe('MeetingRoomScreen — trước phòng', () => {
  it('chưa đăng nhập → chuyển sang /login, không gọi API', async () => {
    useAuthStore.setState({ status: 'anonymous', user: null });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);
    expect(jest.mocked(Redirect).mock.calls[0]?.[0]).toMatchObject({ href: '/login' });
    expect(service.getBrief).not.toHaveBeenCalled();
  });

  it('pre-join: tải chi tiết rồi hiện tiêu đề + nút chính "Tham gia"; bấm → `join` → màn chờ chủ trì', async () => {
    service.join.mockResolvedValue({ ...WAITING_RESULT });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    expect(await screen.findByText('Họp giao ban')).toBeOnTheScreen();
    await press('Tham gia');
    expect(await screen.findByText('Chủ trì chưa bắt đầu cuộc họp')).toBeOnTheScreen();
    expect(service.join).toHaveBeenCalledWith('m1', expect.objectContaining({ deviceId: 'dev-1', displayName: 'An' }));
  });

  it('chủ trì chưa bắt đầu: nút chính là "Bắt đầu cuộc họp" và gọi `start`', async () => {
    service.getBrief.mockResolvedValue(HOST_BRIEF);
    service.start.mockResolvedValue({ ...WAITING_RESULT });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    await press('Bắt đầu cuộc họp');
    await waitFor(() => expect(service.start).toHaveBeenCalledWith('m1', expect.objectContaining({ expectedVersion: 7 })));
  });

  it('mất mạng lúc tải chi tiết: "Kết nối để tham gia" + "Thử lại"', async () => {
    service.getBrief.mockRejectedValue(Object.assign(new Error('Network Error'), { isAxiosError: true }));
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);
    expect(await screen.findByText('Kết nối để tham gia', {}, { timeout: 3000 })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeOnTheScreen();
  });

  it('CALL_004 → hộp thoại "Chuyển sang cuộc họp này?"; "Chuyển sang đây" gọi lại `join` với force', async () => {
    service.join.mockRejectedValueOnce(apiError(409, 'CALL_004', { sameCallOtherDevice: false })).mockResolvedValueOnce({ ...WAITING_RESULT });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    await press('Tham gia');
    expect(await screen.findByText(/Chuyển sang cuộc họp này\?/)).toBeOnTheScreen();
    await press('Chuyển sang đây');
    await waitFor(() => expect(service.join).toHaveBeenLastCalledWith('m1', expect.objectContaining({ force: true })));
  });

  it('đang ở phòng của cuộc họp KHÁC: hỏi chuyển; "Huỷ" quay lại, không đụng phiên cũ', async () => {
    meetingRoomApi.patch({ meetingId: 'cu', phase: 'IN_ROOM' });
    await renderScreen(<MeetingRoomScreen meetingId="moi" />);

    expect(await screen.findByText(/Chuyển sang cuộc họp này\?/)).toBeOnTheScreen();
    await press('Huỷ');
    expect(router.back).toHaveBeenCalled();
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: 'cu', phase: 'IN_ROOM' });
  });

  it('WAITING_FOR_HOST: đếm ngược tới giờ bắt đầu; "Thoát" dọn phiên và quay lại', async () => {
    open('WAITING_FOR_HOST', { waiting: { joinOpensAt: WAITING_RESULT.joinOpensAt, startAt: WAITING_RESULT.startAt } });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    expect(await screen.findByText('Chủ trì chưa bắt đầu cuộc họp')).toBeOnTheScreen();
    await press('Thoát');
    expect(router.back).toHaveBeenCalled();
    expect(meetingRoomApi.get().meetingId).toBeNull();
  });

  it('IN_LOBBY: "Đang chờ chủ trì cho vào…"; "Huỷ yêu cầu" gọi DELETE lobby/me và về pre-join', async () => {
    open('IN_LOBBY');
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    expect(await screen.findByText('Đang chờ chủ trì cho vào…')).toBeOnTheScreen();
    await press('Huỷ yêu cầu');
    await waitFor(() => expect(meetingRoomHostService.cancelMyRequest).toHaveBeenCalledWith('m1'));
    expect(await screen.findByRole('button', { name: 'Tham gia' })).toBeOnTheScreen();
  });

  it.each([
    ['BLOCKED', 'Cuộc họp đã khoá', { blockedCode: 'MEET_007' as const }],
    ['REMOVED', 'Bạn đã được mời ra khỏi cuộc họp', {}],
  ])('%s → "%s"', async (phase, text, extra) => {
    open(phase as 'BLOCKED' | 'REMOVED', extra);
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);
    expect(await screen.findByText(text)).toBeOnTheScreen();
  });

  it('ENDED: thời lượng + lý do; "Về chi tiết cuộc họp" dọn phiên và quay lại', async () => {
    open('ENDED', { endedDurationSec: 2700, endedReason: 'HOST_ENDED' });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    expect(await screen.findByText('Cuộc họp đã kết thúc · 45 phút')).toBeOnTheScreen();
    expect(screen.getByText('Chủ trì đã kết thúc cuộc họp.')).toBeOnTheScreen();
    await press('Về chi tiết cuộc họp');
    await act(async () => Promise.resolve());
    expect(router.back).toHaveBeenCalled();
    expect(meetingRoomApi.get().meetingId).toBeNull();
  });

  it('ENDED vì vào bằng máy khác: "Vào lại trên máy này" mở lại pre-join của CHÍNH cuộc họp; lý do khác thì không có nút đó', async () => {
    open('ENDED', { endedDurationSec: 600, endedReason: 'HOST_ENDED' });
    const ended = await renderScreen(<MeetingRoomScreen meetingId="m1" />);
    expect(await screen.findByText('Chủ trì đã kết thúc cuộc họp.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Vào lại trên máy này' })).toBeNull();
    await ended.unmount();

    open('ENDED', { endedDurationSec: 600, endedReason: 'MOVED_DEVICE' });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);
    await press('Vào lại trên máy này');
    expect(await screen.findByRole('button', { name: 'Tham gia' })).toBeOnTheScreen();
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: 'm1', phase: 'PREJOIN' });
  });

  it('CONNECTING: báo đang kết nối (nói ĐÚNG mic/camera sẽ bật hay tắt) và cho HUỶ (rời phiên)', async () => {
    open('CONNECTING', { callId: 'call1', preJoin: { cam: false, displayName: 'An', facing: 'front', listenOnly: false, mic: true } });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    expect(await screen.findByText('Đang kết nối vào phòng họp…')).toBeOnTheScreen();
    expect(screen.getByText('Bạn sẽ vào với mic bật và camera tắt.')).toBeOnTheScreen();
    await press('Huỷ');
    await waitFor(() => expect(service.leave).toHaveBeenCalledWith('m1', undefined));
  });
});
