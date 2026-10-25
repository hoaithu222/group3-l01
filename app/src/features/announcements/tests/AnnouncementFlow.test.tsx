import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { io } from 'socket.io-client';

import { SocketEvent, useConnectionState } from '@/core/socket';
import { ChatRoomHostSlot, MessageBubbleFooterSlot } from '@/shared/message-extensions';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import { announcementsService } from '../api/announcements.service';
import { makeMessage, makeScope, makeView, renderWithProviders } from './fixtures';
import '../register';

/**
 * Luồng ghép: Host (tải danh sách + nghe socket) + hàng phụ dưới bong bóng, qua khe của `chat`. Kiểm đúng thứ người dùng thấy
 * khi có yêu cầu mới, khi bấm "Tôi đã đọc", khi có người xác nhận và khi yêu cầu bị huỷ.
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/announcements.service', () => ({
  announcementsService: { confirm: jest.fn(), listByChannel: jest.fn() },
}));

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;
const emit = (event: string, payload: unknown) =>
  act(async () => mockSocket.__emitServer(event, payload));

const mockedList = jest.mocked(announcementsService.listByChannel);
const mockedConfirm = jest.mocked(announcementsService.confirm);
const scope = makeScope();
const CREATED = {
  cancelled: false,
  channelId: 'ch-1',
  deadlineAt: null,
  messageId: 'm-1',
  required: true,
};

async function renderRoom() {
  await renderWithProviders(
    <>
      <ChatRoomHostSlot scope={scope} />
      <MessageBubbleFooterSlot isOwn={false} message={makeMessage()} scope={scope} />
    </>,
  );
  await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useFeature).mockReturnValue(true);
  jest.mocked(useConnectionState).mockReturnValue('connected');
  mockedList.mockResolvedValue([]);
  mockedConfirm.mockResolvedValue({ confirmedAt: '2026-09-25T01:00:00.000Z' });
  useAuthStore.setState({ user: { id: 'u-me', name: 'Tôi' } as never });
});

describe('luồng người đọc', () => {
  it('chưa có yêu cầu → tin không có huy hiệu; yêu cầu được tạo (socket) → huy hiệu + nút hiện, bấm là "Đã xác nhận"', async () => {
    await renderRoom();
    expect(screen.queryByText('Cần xác nhận')).toBeNull();

    mockedList.mockResolvedValue([makeView()]);
    await emit(SocketEvent.ANNOUNCEMENT_UPDATED, CREATED);
    expect(await screen.findByText('Cần xác nhận')).toBeOnTheScreen();

    mockedList.mockResolvedValue([makeView({ confirmedByMe: true })]);
    await fireEvent.press(screen.getByText('Tôi đã đọc'));

    expect(await screen.findByText('Đã xác nhận')).toBeOnTheScreen();
    expect(screen.queryByText('Tôi đã đọc')).toBeNull();
    expect(mockedConfirm).toHaveBeenCalledWith('m-1');
  });

  it('người quản lý huỷ yêu cầu (socket) → huy hiệu và nút biến mất khỏi tin', async () => {
    mockedList.mockResolvedValue([makeView()]);
    await renderRoom();
    expect(await screen.findByText('Cần xác nhận')).toBeOnTheScreen();

    await emit(SocketEvent.ANNOUNCEMENT_UPDATED, { ...CREATED, cancelled: true, required: false });

    await waitFor(() => expect(screen.queryByText('Cần xác nhận')).toBeNull());
    expect(screen.queryByText('Tôi đã đọc')).toBeNull();
  });

  it('thiết bị khác của mình vừa xác nhận (socket user) → tin này đổi sang "Đã xác nhận", nút biến mất', async () => {
    mockedList.mockResolvedValue([makeView()]);
    await renderRoom();
    expect(await screen.findByText('Tôi đã đọc')).toBeOnTheScreen();

    await emit(SocketEvent.ANNOUNCEMENT_UPDATED, {
      channelId: 'ch-1',
      confirmedByMe: true,
      messageId: 'm-1',
      required: true,
    });

    expect(await screen.findByText('Đã xác nhận')).toBeOnTheScreen();
    expect(screen.queryByText('Tôi đã đọc')).toBeNull();
  });
});

describe('luồng người yêu cầu', () => {
  beforeEach(() => useAuthStore.setState({ user: { id: 'u-admin', name: 'Admin' } as never }));

  it('không có nút "Tôi đã đọc"; thấy "N đã xác nhận" và số đếm tăng ngay khi có người xác nhận (announcement:confirmed)', async () => {
    mockedList.mockResolvedValue([makeView({ canViewReceipts: true, confirmedCount: 3 })]);
    await renderRoom();

    expect(await screen.findByText('3 đã xác nhận')).toBeOnTheScreen();
    expect(screen.queryByText('Tôi đã đọc')).toBeNull();

    await emit(SocketEvent.ANNOUNCEMENT_CONFIRMED, {
      channelId: 'ch-1',
      confirmedCount: 4,
      messageId: 'm-1',
    });

    expect(await screen.findByText('4 đã xác nhận')).toBeOnTheScreen();
  });
});
