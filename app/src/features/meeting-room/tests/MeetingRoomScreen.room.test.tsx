import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { meetingRoomHostService } from '../api/meeting-room-host.service';
import { meetingRoomService } from '../api/meeting-room.service';
import { MeetingRoomHost } from '../components/MeetingRoomHost';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { MeetingRoomScreen } from '../screens/MeetingRoomScreen';
import { meetingRoomApi } from '../store/meeting-room.store';
import { fakeParticipant, makeBrief, makeLobbyEntry, makeServerParticipant, makeSnapshot } from './fixtures';
import { apiError, flushMicrotasks, installMicrotaskQueryNotifications } from './hook-wrapper';
import { renderScreen } from './screen-helpers';

/** Màn phòng họp TRONG phòng (app.md §3.2, §8): điều khiển theo vai trò, mic theo track thật, hộp thoại Rời (thường 2 · chủ trì 3 + xác nhận lần 2), Người tham gia + hàng chờ, "Thêm", banner, thu nhỏ ↔ MiniBar. */
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
  meetingRoomService: { end: jest.fn(), getBrief: jest.fn(), leave: jest.fn(), listAllAttendees: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn() },
}));
jest.mock('../api/meeting-room-host.service', () => ({ meetingRoomHostService: { listLobby: jest.fn() } }));

installMicrotaskQueryNotifications();

const service = jest.mocked(meetingRoomService);
let media: FakeMeetingMedia;

const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));

/** Đang trong phòng với mình + Lan; `role` quyết định thanh điều khiển và hộp thoại Rời. */
function inRoom(role: 'HOST' | 'MEMBER', extra: Parameters<typeof meetingRoomApi.patch>[0] = {}): void {
  const host = role === 'HOST';
  meetingRoomApi.reset();
  meetingRoomApi.patch({
    brief: makeBrief({ myActions: { canEnd: host, canJoin: true, canRecord: false, canStart: false, joinVia: 'DIRECT' } }),
    callId: 'call1',
    connection: 'connected',
    conversationId: 'conv1',
    meetingId: 'm1',
    participants: [fakeParticipant({ identity: 'me', isLocal: true, name: 'Tôi' }), fakeParticipant({ identity: 'u2', name: 'Lan' })],
    phase: 'IN_ROOM',
    role,
    startedAt: new Date(Date.now() - 90_000).toISOString(),
    ...extra,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  media = new FakeMeetingMedia();
  setMeetingMediaForTests(media);
  service.leave.mockResolvedValue(undefined);
  service.getBrief.mockResolvedValue(makeBrief({ serverNow: new Date().toISOString() })); // đồng hồ họp theo giờ server ≈ giờ máy
  service.listAllAttendees.mockResolvedValue([]);
  service.snapshot.mockResolvedValue(makeSnapshot({ participants: [makeServerParticipant({ name: 'Lan', role: 'MEMBER', userId: 'u2' })] }));
  jest.mocked(meetingRoomHostService.listLobby).mockResolvedValue([]);
  jest.mocked(router.canGoBack).mockReturnValue(true);
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
});

describe('MeetingRoomScreen — trong phòng', () => {
  it('người thường: tiêu đề + đồng hồ, tên người trong phòng, thanh điều khiển không có mục của chủ trì', async () => {
    inRoom('MEMBER');
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    expect(await screen.findByText('Họp giao ban')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Thời lượng cuộc họp 01:3\d$/)).toBeOnTheScreen();
    expect(await screen.findByText('Lan')).toBeOnTheScreen();
    for (const name of ['Bật micro', 'Bật camera', 'Rời cuộc họp', 'Gửi cảm xúc', 'Thêm tuỳ chọn']) expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    expect(screen.queryByText('Kết thúc cho mọi người')).toBeNull();
  });

  it('bật mic: xin quyền → bật thật → nút đổi thành "Tắt micro" theo track', async () => {
    inRoom('MEMBER');
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    await press('Bật micro');
    await waitFor(() => expect(media.mic).toBe(true));
    media.setParticipants([fakeParticipant({ identity: 'me', isLocal: true, micEnabled: true })]);
    expect(await screen.findByRole('button', { name: 'Tắt micro' })).toBeOnTheScreen();
  });

  it('người thường bấm Rời: hộp thoại "Rời cuộc họp?" → rời (báo server) rồi quay lại', async () => {
    inRoom('MEMBER');
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    await press('Rời cuộc họp');
    expect(await screen.findByText('Rời cuộc họp?')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Rời cuộc họp' }).at(-1)!); // nút của hộp thoại (nút ở thanh điều khiển trùng tên)
    await act(flushMicrotasks); // cả chuỗi ngắt media → báo server → dọn store chạy hết TRONG act
    expect(service.leave).toHaveBeenCalledWith('m1', undefined);
    expect(router.back).toHaveBeenCalled();
    expect(meetingRoomApi.get().meetingId).toBeNull();
  });

  it('chủ trì bấm Rời: 3 lựa chọn; "Kết thúc cho mọi người" phải xác nhận lần 2 rồi sang màn "đã kết thúc"', async () => {
    inRoom('HOST');
    service.end.mockResolvedValue(makeBrief({ endedAt: '2026-10-01T09:45:00.000Z', startedAt: '2026-10-01T09:00:00.000Z', status: 'ENDED' }));
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    await press('Rời cuộc họp');
    for (const label of ['Rời (giữ cuộc họp)', 'Rời và giao quyền cho…', 'Kết thúc cho mọi người']) expect(await screen.findByText(label)).toBeOnTheScreen();
    await press(/^Kết thúc cho mọi người/); // hàng menu: tên trợ năng = nhãn + mô tả hệ quả ⇒ khớp theo ĐẦU câu
    expect(await screen.findByText('Kết thúc cuộc họp cho mọi người?')).toBeOnTheScreen();
    expect(service.end).not.toHaveBeenCalled();

    await press('Kết thúc');
    await waitFor(() => expect(service.end).toHaveBeenCalledWith('m1'));
    expect(await screen.findByText('Cuộc họp đã kết thúc · 45 phút')).toBeOnTheScreen();
  });

  it('Người tham gia: chủ trì thấy hàng chờ và "Cho vào"; người thường thì không', async () => {
    inRoom('HOST');
    jest.mocked(meetingRoomHostService.listLobby).mockResolvedValue([makeLobbyEntry('u5')]);
    const host = await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    await press(/^Danh sách người tham gia/);
    expect(await screen.findByText('Trong phòng (2)')).toBeOnTheScreen();
    expect(await screen.findByRole('button', { name: 'Cho Khách u5 vào' })).toBeOnTheScreen();
    await host.unmount();

    inRoom('MEMBER', { lobby: [makeLobbyEntry('u5')] });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);
    await press(/^Danh sách người tham gia/);
    expect(await screen.findByText('Trong phòng (2)')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Cho .* vào$/ })).toBeNull();
  });

  it('"Thêm": chủ trì có Khoá cuộc họp; tắt mic tất cả phải qua xác nhận rồi mới gọi server', async () => {
    inRoom('HOST');
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    await press('Thêm tuỳ chọn');
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 80))); // lưới phía sau cập nhật ô xong TRONG act
    expect(await screen.findByText('Khoá cuộc họp')).toBeOnTheScreen();
    fireEvent.press(await screen.findByText('Tắt mic tất cả'));
    expect(await screen.findByText('Tắt mic của tất cả mọi người?')).toBeOnTheScreen();
  });

  it('mất mạng: banner "Đang kết nối lại…"; sắp đóng: banner N phút', async () => {
    inRoom('MEMBER', { closingAt: new Date(Date.now() + 4.5 * 60_000).toISOString(), phase: 'RECONNECTING' });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    expect(await screen.findByText('Đang kết nối lại…')).toBeOnTheScreen();
    expect(screen.getByText(/Cuộc họp sẽ tự kết thúc sau 5 phút/)).toBeOnTheScreen();
  });

  it('có MeetingRoomHost: "Thu nhỏ" giữ phòng, rời màn và hiện MiniBar; "Quay lại" mở lại màn phòng. Chưa có Host thì KHÔNG có nút Thu nhỏ', async () => {
    inRoom('MEMBER');
    const alone = await renderScreen(<MeetingRoomScreen meetingId="m1" />);
    await screen.findByText('Họp giao ban');
    expect(screen.queryByRole('button', { name: 'Thu nhỏ cuộc họp' })).toBeNull();
    await alone.unmount();

    inRoom('MEMBER');
    await renderScreen(
      <>
        <MeetingRoomHost />
        <MeetingRoomScreen meetingId="m1" />
      </>,
    );
    await press('Thu nhỏ cuộc họp');
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: 'm1', minimized: true, phase: 'IN_ROOM' });

    await press(/Quay lại/);
    expect(router.push).toHaveBeenCalledWith({ params: { meetingId: 'm1' }, pathname: '/meeting-room/[meetingId]' });
  });

  it('lỗi kết thúc cho mọi người (đã kết thúc trước đó): ở lại phòng, không sang màn kết thúc', async () => {
    inRoom('HOST');
    service.end.mockRejectedValue(apiError(409, 'MEET_009'));
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    await press('Rời cuộc họp');
    await press(/^Kết thúc cho mọi người/); // hàng menu của tấm Rời → bước xác nhận
    await press('Kết thúc');
    await waitFor(() => expect(service.end).toHaveBeenCalled());
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');
  });
});
