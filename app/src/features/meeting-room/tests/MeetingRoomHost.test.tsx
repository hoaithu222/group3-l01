import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { meetingRoomHostService } from '../api/meeting-room-host.service';
import { meetingRoomService } from '../api/meeting-room.service';
import { MeetingRoomHost } from '../components/MeetingRoomHost';
import { MeetingRoomScreen } from '../screens/MeetingRoomScreen';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { meetingRoomApi } from '../store/meeting-room.store';
import { makeBrief, makeSnapshot } from './fixtures';
import { renderScreen } from './screen-helpers';

/**
 * `MeetingRoomHost` (mount toàn cục ở `(app)/_layout.tsx`): chỉ vẽ `MeetingMiniBar` khi phòng đang chạy VÀ đã thu nhỏ; đồng hồ theo giờ server;
 * nút mic thu nhỏ dùng đúng đường bật/tắt của phòng; "Quay lại" mở lại màn phòng.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(() => Promise.resolve()), deactivateKeepAwake: jest.fn(() => Promise.resolve()) }));
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
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(() => Promise.resolve('dev-1')) }));
jest.mock('@/features/chat', () => ({ ChatRoom: () => null, useChatScope: () => ({}) }));
jest.mock('../hooks/useMicLevel', () => ({ useMicLevel: jest.fn(() => 0) }));
jest.mock('../api/meeting-room.service', () => ({
  meetingRoomService: { getBrief: jest.fn(), leave: jest.fn(), listAllAttendees: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn() },
}));
jest.mock('../api/meeting-room-host.service', () => ({ meetingRoomHostService: { listLobby: jest.fn() } }));

let media: FakeMeetingMedia;

const live = (extra: Parameters<typeof meetingRoomApi.patch>[0] = {}) =>
  meetingRoomApi.patch({
    brief: makeBrief(),
    callId: 'call1',
    meetingId: 'm1',
    minimized: true,
    phase: 'IN_ROOM',
    startedAt: new Date(Date.now() - 125_000).toISOString(),
    ...extra,
  });

beforeEach(() => {
  jest.clearAllMocks();
  meetingRoomApi.reset();
  media = new FakeMeetingMedia();
  setMeetingMediaForTests(media);
  // Màn phòng (test "bị gỡ") gọi API thật nếu không giả: chi tiết, ảnh chụp phòng, danh sách mời, hàng chờ.
  jest.mocked(meetingRoomService.getBrief).mockResolvedValue(makeBrief({ serverNow: new Date().toISOString() }));
  jest.mocked(meetingRoomService.snapshot).mockResolvedValue(makeSnapshot());
  jest.mocked(meetingRoomService.listAllAttendees).mockResolvedValue([]);
  jest.mocked(meetingRoomHostService.listLobby).mockResolvedValue([]);
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
});

describe('MeetingRoomHost', () => {
  it('không có phiên / chưa thu nhỏ / phiên chưa vào phòng → không vẽ gì', async () => {
    const { rerender } = await renderScreen(<MeetingRoomHost />);
    expect(screen.queryByRole('button', { name: /Quay lại/ })).toBeNull();

    await act(async () => live({ minimized: false }));
    await rerender(<MeetingRoomHost />);
    expect(screen.queryByRole('button', { name: /Quay lại/ })).toBeNull();

    await act(async () => live({ phase: 'PREJOIN' }));
    await rerender(<MeetingRoomHost />);
    expect(screen.queryByRole('button', { name: /Quay lại/ })).toBeNull();
  });

  it('đang họp + đã thu nhỏ → MiniBar có tên cuộc họp và đồng hồ (theo giờ server); "Quay lại" mở lại màn phòng', async () => {
    live();
    meetingRoomApi.patch({ serverOffsetMs: 0 });
    await renderScreen(<MeetingRoomHost />);

    expect(await screen.findByText(/Họp giao ban/)).toBeOnTheScreen();
    expect(screen.getByText(/02:0\d/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: /Quay lại/ }));
    expect(router.push).toHaveBeenCalledWith({ params: { meetingId: 'm1' }, pathname: '/meeting-room/[meetingId]' });
  });

  it('màn phòng bị gỡ khi phòng còn chạy (không qua "Thu nhỏ"): tự đánh dấu thu nhỏ để MiniBar hiện — luôn có đường quay lại', async () => {
    live({ minimized: false });
    const { rerender } = await renderScreen(
      <>
        <MeetingRoomHost />
        <MeetingRoomScreen meetingId="m1" />
      </>,
    );
    expect(screen.queryByRole('button', { name: /Quay lại/ })).toBeNull();

    await rerender(<MeetingRoomHost />); // gỡ màn phòng
    expect(await screen.findByRole('button', { name: /Quay lại/ })).toBeOnTheScreen();
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: 'm1', minimized: true, phase: 'IN_ROOM' });
  });

  it('nút mic của MiniBar: bật/tắt mic THẬT của phòng (không tự bật khi vào)', async () => {
    live({ micOn: false });
    await renderScreen(<MeetingRoomHost />);
    expect(media.mic).toBe(false);

    await fireEvent.press(await screen.findByRole('button', { name: /Bật micro/ }));
    await waitFor(() => expect(meetingRoomApi.get().micOn).toBe(true));
    expect(media.mic).toBe(true);
  });
});
