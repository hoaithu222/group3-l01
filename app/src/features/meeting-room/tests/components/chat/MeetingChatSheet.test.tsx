import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type * as ReactNative from 'react-native';

import { meetingRoomService } from '../../../api/meeting-room.service';
import type { AttendeeLite } from '../../../api/meeting-room.types';
import { MeetingChatSheet, type MeetingChatSheetProps } from '../../../components/chat/MeetingChatSheet';
import { renderWithProviders } from '../prejoin/render-helpers';

/**
 * `MeetingChatSheet` (app.md p2-05 §3.2): ghép `ChatRoom` lên `conversationId` của cuộc họp. `@/core/socket` và `@/features/chat` được mock
 * CHỈ ở test này (chat là feature nền có test riêng); service bị mock để điều khiển quyền gửi tin và danh sách người được mời.
 */

let mockRoom: { code?: string; status: 'denied' | 'joined' | 'pending' } = { status: 'joined' };
let mockChatProps: {
  capabilities: { canWrite: boolean; readOnlyReason?: string };
  emptyHint: string;
  resolveAuthor: (userId: string) => { avatarUrl?: string | null; name: string } | undefined;
  scope: { scopeId: string; scopeType: string };
} | null = null;

jest.mock('@/core/socket', () => ({ useRoomSubscription: jest.fn(() => mockRoom) }));
jest.mock('@/features/chat', () => {
  const { Text } = jest.requireActual<typeof ReactNative>('react-native');
  return {
    ChatRoom: (props: NonNullable<typeof mockChatProps>) => {
      mockChatProps = props;
      return <Text>{`ChatRoom ${props.scope.scopeType}:${props.scope.scopeId} canWrite=${String(props.capabilities.canWrite)}`}</Text>;
    },
    useChatScope: (scopeType: string, scopeId: string) => ({ scopeId, scopeType }),
  };
});
jest.mock('../../../api/meeting-room.service', () => ({
  meetingRoomService: { chatAccess: jest.fn(), listAttendees: jest.fn() },
}));

const svc = jest.mocked(meetingRoomService);

const lite = (userId: string, name: string): AttendeeLite => ({ avatarUrl: null, name, role: 'ATTENDEE', rsvp: 'ACCEPTED', userId });
const httpError = (status: number) => Object.assign(new Error(`HTTP ${String(status)}`), { isAxiosError: true, response: { data: {}, status } });

function makeProps(over: Partial<MeetingChatSheetProps> = {}): MeetingChatSheetProps {
  return { canCreate: false, conversationId: 'conv1', meetingId: 'm1', onClose: jest.fn(), visible: true, ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRoom = { status: 'joined' };
  mockChatProps = null;
  svc.chatAccess.mockResolvedValue({ canSend: true, readOnlyReason: null });
  svc.listAttendees.mockResolvedValue({ items: [lite('u1', 'Lan')], nextCursor: null });
});

describe('MeetingChatSheet — chưa có nhóm chat', () => {
  it('chủ trì: thấy "Tạo nhóm chat cho cuộc họp", bấm gọi onCreate; không gọi mạng nào', async () => {
    const onCreate = jest.fn();
    await renderWithProviders(<MeetingChatSheet {...makeProps({ canCreate: true, conversationId: null, onCreate })} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tạo nhóm chat cho cuộc họp' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(svc.chatAccess).not.toHaveBeenCalled();
    expect(svc.listAttendees).not.toHaveBeenCalled();
  });

  it('đang tạo: nút "Đang tạo…" khoá', async () => {
    const onCreate = jest.fn();
    await renderWithProviders(<MeetingChatSheet {...makeProps({ canCreate: true, conversationId: null, creating: true, onCreate })} />);

    const button = screen.getByRole('button', { name: 'Đang tạo…' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('người thường: "Chủ trì chưa bật chat", không có nút tạo', async () => {
    await renderWithProviders(<MeetingChatSheet {...makeProps({ conversationId: null, onCreate: jest.fn() })} />);

    expect(screen.getByText('Chủ trì chưa bật chat')).toBeOnTheScreen();
    expect(screen.queryByText('Tạo nhóm chat cho cuộc họp')).toBeNull();
  });
});

describe('MeetingChatSheet — có nhóm chat', () => {
  it('chờ quyền gửi tin rồi dựng ChatRoom đúng scope với canWrite từ chatAccess', async () => {
    await renderWithProviders(<MeetingChatSheet {...makeProps()} />);

    expect(await screen.findByText('ChatRoom CONVERSATION:conv1 canWrite=true')).toBeOnTheScreen();
    expect(svc.chatAccess).toHaveBeenCalledWith('conv1');
    expect(mockChatProps?.emptyHint).toBe('Chưa có tin nhắn trong cuộc họp');
    expect(mockChatProps?.capabilities.readOnlyReason).toBeUndefined();
  });

  it('bị khoá gửi tin: canWrite=false + lý do do server nêu (vẫn đọc được)', async () => {
    svc.chatAccess.mockResolvedValue({ canSend: false, readOnlyReason: 'Cuộc họp đã kết thúc' });
    await renderWithProviders(<MeetingChatSheet {...makeProps()} />);

    expect(await screen.findByText('ChatRoom CONVERSATION:conv1 canWrite=false')).toBeOnTheScreen();
    expect(mockChatProps?.capabilities).toEqual({ canWrite: false, readOnlyReason: 'Cuộc họp đã kết thúc' });
  });

  it('tên tác giả lấy từ người được mời (gom nhiều trang); người lạ hiện "Thành viên"', async () => {
    svc.listAttendees.mockImplementation((_meetingId: string, cursor?: string) =>
      Promise.resolve(
        cursor === undefined
          ? { items: [lite('u1', 'Lan')], nextCursor: 'c2' }
          : { items: [lite('u2', 'Bình')], nextCursor: null },
      ),
    );
    await renderWithProviders(<MeetingChatSheet {...makeProps()} />);
    await screen.findByText(/ChatRoom/);
    await waitFor(() => expect(mockChatProps?.resolveAuthor('u2')?.name).toBe('Bình'));

    expect(mockChatProps?.resolveAuthor('u1')?.name).toBe('Lan');
    expect(mockChatProps?.resolveAuthor('lạ')).toEqual({ name: 'Thành viên' });
    expect(svc.listAttendees).toHaveBeenCalledWith('m1', undefined);
    expect(svc.listAttendees).toHaveBeenCalledWith('m1', 'c2');
  });

  it('danh sách người được mời vô tận: dừng ở 4 trang', async () => {
    svc.listAttendees.mockResolvedValue({ items: [lite('u1', 'Lan')], nextCursor: 'tiep' });
    await renderWithProviders(<MeetingChatSheet {...makeProps()} />);

    await waitFor(() => expect(svc.listAttendees).toHaveBeenCalledTimes(4));
  });

  it('chưa biết quyền gửi tin: chưa dựng ChatRoom (tránh nháy "chỉ đọc")', async () => {
    let resolveAccess: (value: { canSend: boolean; readOnlyReason: string | null }) => void = () => undefined;
    svc.chatAccess.mockReturnValue(new Promise((resolve) => (resolveAccess = resolve)));
    await renderWithProviders(<MeetingChatSheet {...makeProps()} />);

    expect(screen.queryByText(/ChatRoom/)).toBeNull();
    await act(async () => resolveAccess({ canSend: true, readOnlyReason: null }));
    expect(await screen.findByText(/ChatRoom/)).toBeOnTheScreen();
  });
});

describe('MeetingChatSheet — mất quyền / đóng', () => {
  it.each([404, 403])('đọc hội thoại lỗi %i (nhóm chat bị xoá/mất quyền) ⇒ tự đóng tấm', async (status) => {
    svc.chatAccess.mockRejectedValue(httpError(status));
    const onClose = jest.fn();
    await renderWithProviders(<MeetingChatSheet {...makeProps({ onClose })} />);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText(/ChatRoom/)).toBeNull();
    expect(screen.getByText('Cuộc trò chuyện này không còn khả dụng.')).toBeOnTheScreen();
  });

  it('phòng socket `conv` bị từ chối ⇒ tự đóng tấm', async () => {
    mockRoom = { code: 'PERM_404', status: 'denied' };
    const onClose = jest.fn();
    await renderWithProviders(<MeetingChatSheet {...makeProps({ onClose })} />);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('lỗi mạng khi đọc quyền (không phải 403/404) KHÔNG đóng tấm', async () => {
    svc.chatAccess.mockRejectedValue(new Error('Network Error'));
    const onClose = jest.fn();
    await renderWithProviders(<MeetingChatSheet {...makeProps({ onClose })} />);

    await waitFor(() => expect(svc.chatAccess).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('visible=false: không gọi mạng, không dựng gì', async () => {
    await renderWithProviders(<MeetingChatSheet {...makeProps({ visible: false })} />);

    expect(svc.chatAccess).not.toHaveBeenCalled();
    expect(screen.queryByText('Trò chuyện')).toBeNull();
  });
});
