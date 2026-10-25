import { act, fireEvent, screen } from '@testing-library/react-native';

import { meetingRoomHostService } from '../api/meeting-room-host.service';
import { meetingRoomService } from '../api/meeting-room.service';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { MeetingRoomScreen } from '../screens/MeetingRoomScreen';
import { meetingRoomApi } from '../store/meeting-room.store';
import { fakeParticipant, makeBrief, makeServerParticipant, makeSnapshot } from './fixtures';
import { installMicrotaskQueryNotifications } from './hook-wrapper';
import { renderScreen } from './screen-helpers';

/**
 * "Khung" của phòng họp (`InRoomView`): Chat/Mọi người/"✋ n" ở thanh tiêu đề, gõ sân khấu để ẩn/hiện mà KHÔNG gỡ thanh (sân khấu không đổi
 * kích thước). Mock giống `MeetingRoomScreen.room.test.tsx`.
 */
jest.mock('expo-router', () => ({
  Redirect: jest.fn(() => null),
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/core/device/device-id', () => ({
  getDeviceId: jest.fn(() => Promise.resolve('dev-1')),
}));
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
  meetingRoomService: {
    end: jest.fn(),
    getBrief: jest.fn(),
    leave: jest.fn(),
    listAllAttendees: jest.fn(),
    renewToken: jest.fn(),
    snapshot: jest.fn(),
  },
}));
jest.mock('../api/meeting-room-host.service', () => ({
  meetingRoomHostService: { listLobby: jest.fn() },
}));

installMicrotaskQueryNotifications();

const service = jest.mocked(meetingRoomService);

/** Sự kiện chạm THÔ giả — chỉ các trường `useAutoHideControls` đọc. */
const touch = { nativeEvent: { pageX: 40, pageY: 300, touches: [{}] } };

/** Một cú gõ lên sân khấu như trên máy: `touchStart` của sân khấu → nổi bọt lên lớp ngoài (`reveal`) → `touchEnd`. */
async function tapStage(): Promise<void> {
  await fireEvent(screen.getByTestId('room-stage'), 'touchStart', touch);
  await fireEvent(screen.getByTestId('room-content'), 'touchStart', touch);
  await fireEvent(screen.getByTestId('room-stage'), 'touchEnd', touch);
}

function inRoom(extra: Parameters<typeof meetingRoomApi.patch>[0] = {}): void {
  meetingRoomApi.reset();
  meetingRoomApi.patch({
    brief: makeBrief(),
    callId: 'call1',
    connection: 'connected',
    conversationId: 'conv1',
    meetingId: 'm1',
    participants: [
      fakeParticipant({ identity: 'me', isLocal: true, name: 'Tôi' }),
      fakeParticipant({ identity: 'u2', name: 'Lan' }),
    ],
    phase: 'IN_ROOM',
    role: 'MEMBER',
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    ...extra,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setMeetingMediaForTests(new FakeMeetingMedia());
  service.getBrief.mockResolvedValue(makeBrief({ serverNow: new Date().toISOString() }));
  service.listAllAttendees.mockResolvedValue([]);
  service.snapshot.mockResolvedValue(
    makeSnapshot({
      participants: [makeServerParticipant({ name: 'Lan', role: 'MEMBER', userId: 'u2' })],
    }),
  );
  jest.mocked(meetingRoomHostService.listLobby).mockResolvedValue([]);
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
});

describe('InRoomView — khung phòng họp', () => {
  it('người khác giơ tay: viên "✋ 1" ở thanh tiêu đề cho cả người thường; chạm mở danh sách người', async () => {
    inRoom({
      participants: [
        fakeParticipant({ identity: 'me', isLocal: true, name: 'Tôi' }),
        fakeParticipant({ handRaisedAt: '2026-10-01T09:00:00.000Z', identity: 'u2', name: 'Lan' }),
      ],
    });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    await fireEvent.press(await screen.findByRole('button', { name: '1 người đang giơ tay' }));
    expect(meetingRoomApi.get().sheet).toBe('PARTICIPANTS');
  });

  it('Chat ở thanh tiêu đề: câu đọc nói số tin chưa đọc; bấm mở chat và xoá huy hiệu', async () => {
    inRoom({ chatUnread: 2 });
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Mở chat, 2 tin nhắn chưa đọc' }),
    );
    expect(meetingRoomApi.get()).toMatchObject({ chatUnread: 0, sheet: 'CHAT' });
  });

  it('gõ sân khấu: tiêu đề + thanh ẨN nhưng VẪN mount (không đổi bố cục sân khấu); gõ lần nữa hiện lại', async () => {
    inRoom();
    await renderScreen(<MeetingRoomScreen meetingId="m1" />);
    expect(await screen.findByRole('button', { name: 'Thêm tuỳ chọn' })).toBeOnTheScreen();

    await act(tapStage);
    expect(screen.queryByRole('button', { name: 'Thêm tuỳ chọn' })).toBeNull();
    expect(
      screen.getByRole('button', { includeHiddenElements: true, name: 'Thêm tuỳ chọn' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Lan')).toBeOnTheScreen();

    await act(tapStage);
    expect(screen.getByRole('button', { name: 'Thêm tuỳ chọn' })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /^Danh sách người tham gia, 2 người/ }),
    ).toBeOnTheScreen();
  });
});
