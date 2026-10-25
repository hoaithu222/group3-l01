import { act, renderHook, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomHostService as host } from '../api/meeting-room-host.service';
import { meetingRoomService } from '../api/meeting-room.service';
import { useMeetingHostControls } from '../hooks/useMeetingHostControls';
import { meetingRoomApi } from '../store/meeting-room.store';
import { makeLobbyEntry } from './fixtures';
import { apiError, makeTestQueryClient, makeWrapper, installMicrotaskQueryNotifications } from './hook-wrapper';

/**
 * Thao tác chủ trì/đồng chủ trì (app.md §2, §4.2): chỉ tải danh sách khi có quyền; duyệt/từ chối hàng chờ, khoá phòng, tắt mic/camera, mời ra,
 * đổi vai trò, hạ tay — không optimistic cho mời ra/khoá, lỗi luôn thành toast tiếng Việt. Vai trò THEO LỊCH quyết định ai đổi được vai trò.
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room-host.service', () => ({
  meetingRoomHostService: {
    admit: jest.fn(), admitAll: jest.fn(), deny: jest.fn(), listLobby: jest.fn(), lowerAllHands: jest.fn(), lowerHand: jest.fn(),
    mute: jest.fn(), muteAll: jest.fn(), remove: jest.fn(), setLocked: jest.fn(), setRole: jest.fn(),
  },
}));
jest.mock('../api/meeting-room.service', () => ({ meetingRoomService: { listAllAttendees: jest.fn(), snapshot: jest.fn() } }));

installMicrotaskQueryNotifications();

const attendees = [
  { avatarUrl: null, name: 'Chủ trì', role: 'HOST' as const, rsvp: 'ACCEPTED' as const, userId: 'h1' },
  { avatarUrl: null, name: 'Đồng lịch', role: 'CO_HOST' as const, rsvp: 'ACCEPTED' as const, userId: 'c1' },
  { avatarUrl: null, name: 'Thường', role: 'ATTENDEE' as const, rsvp: 'PENDING' as const, userId: 'u2' },
];

async function setup(role: 'CO_HOST' | 'HOST' | 'MEMBER' = 'HOST') {
  await act(async () => meetingRoomApi.patch({ callId: 'call1', meetingId: 'm1', phase: 'IN_ROOM', role }));
  const hook = await renderHook(() => useMeetingHostControls(), { wrapper: makeWrapper(makeTestQueryClient()) });
  // React Query báo kết quả qua `setTimeout(0)` — chờ hai truy vấn (hàng chờ + danh sách mời) tải xong rồi mới thao tác.
  if (role !== 'MEMBER') {
    await waitFor(() => {
      expect(hook.result.current.attendees).toHaveLength(3);
      expect(meetingRoomApi.get().lobby).toHaveLength(2);
    });
  }
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  meetingRoomApi.reset();
  jest.mocked(host.listLobby).mockResolvedValue([makeLobbyEntry('u5'), makeLobbyEntry('u6')]);
  jest.mocked(meetingRoomService.listAllAttendees).mockResolvedValue(attendees);
  jest.mocked(host.admit).mockResolvedValue({ admitted: true });
  jest.mocked(host.deny).mockResolvedValue({ denied: true });
  jest.mocked(host.admitAll).mockResolvedValue({ admittedUserIds: ['u5', 'u6'] });
  jest.mocked(host.setLocked).mockResolvedValue({ lockedAt: '2026-10-01T09:10:00.000Z', version: 4 });
  jest.mocked(host.muteAll).mockResolvedValue({ mutedCount: 3 });
  for (const fn of [host.mute, host.remove, host.setRole, host.lowerAllHands, host.lowerHand]) jest.mocked(fn).mockResolvedValue(undefined);
});

afterEach(() => meetingRoomApi.reset());

describe('useMeetingHostControls', () => {
  it('người thường: không tải hàng chờ/danh sách mời, không có quyền quản lý', async () => {
    const { result } = await setup('MEMBER');
    expect(result.current).toMatchObject({ hostLike: false, isHost: false });
    expect(host.listLobby).not.toHaveBeenCalled();
    expect(meetingRoomService.listAllAttendees).not.toHaveBeenCalled();
  });

  it('chủ trì: tải hàng chờ vào store', async () => {
    const { result } = await setup('HOST');
    expect(result.current).toMatchObject({ hostLike: true, isHost: true });
    expect(meetingRoomApi.get().lobby.map((e) => e.userId)).toEqual(['u5', 'u6']);
  });

  it('đồng chủ trì cũng quản lý được nhưng không phải chủ trì (isHost = false)', async () => {
    const { result } = await setup('CO_HOST');
    expect(result.current).toMatchObject({ hostLike: true, isHost: false });
  });

  it('cho vào / từ chối gỡ dòng khỏi hàng chờ SAU KHI server xác nhận; cho tất cả vào xoá hết', async () => {
    const { result } = await setup();
    await act(async () => result.current.admit('u5'));
    expect(host.admit).toHaveBeenCalledWith('m1', 'u5');
    expect(meetingRoomApi.get().lobby.map((e) => e.userId)).toEqual(['u6']);

    await act(async () => result.current.deny('u6'));
    expect(meetingRoomApi.get().lobby).toEqual([]);

    await act(async () => meetingRoomApi.patch({ lobby: [makeLobbyEntry('u5'), makeLobbyEntry('u6')] }));
    await act(async () => result.current.admitAll());
    expect(meetingRoomApi.get().lobby).toEqual([]);
  });

  it('khoá/mở khoá: chờ server, ghi lockedAt và báo; mở khoá gọi `unlock`', async () => {
    const { result } = await setup();
    await act(async () => result.current.toggleLock());
    expect(host.setLocked).toHaveBeenLastCalledWith('m1', true);
    expect(meetingRoomApi.get().lockedAt).toBe('2026-10-01T09:10:00.000Z');
    expect(showToast).toHaveBeenLastCalledWith('success', expect.stringContaining('Đã khoá'));

    jest.mocked(host.setLocked).mockResolvedValueOnce({ lockedAt: null, version: 5 });
    await act(async () => result.current.toggleLock());
    expect(host.setLocked).toHaveBeenLastCalledWith('m1', false);
    expect(meetingRoomApi.get().lockedAt).toBeNull();
  });

  it('tắt mic/camera/chia sẻ một người, tắt mic tất cả, hạ tay, mời ra, đổi vai trò — gọi đúng endpoint', async () => {
    const { result } = await setup();
    await act(async () => result.current.mute('u2', 'CAMERA'));
    expect(host.mute).toHaveBeenCalledWith('m1', 'u2', 'CAMERA');
    await act(async () => result.current.muteAll());
    expect(showToast).toHaveBeenLastCalledWith('success', 'Đã tắt mic của 3 người.');
    await act(async () => result.current.lowerAllHands());
    expect(host.lowerAllHands).toHaveBeenCalledWith('m1');
    await act(async () => result.current.removeParticipant('u2', true));
    expect(host.remove).toHaveBeenCalledWith('m1', 'u2', true);
    await act(async () => result.current.setRole('u2', 'CO_HOST'));
    expect(host.setRole).toHaveBeenCalledWith('m1', 'u2', 'CO_HOST');
  });

  it('hạ tay MỘT người: gọi đúng endpoint, hàng đó loading trong lúc chờ (không toast khi xong — bàn tay tự rời danh sách)', async () => {
    let release: () => void = () => undefined;
    jest.mocked(host.lowerHand).mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const { result } = await setup();

    await act(async () => result.current.lowerHand('u2'));
    expect(host.lowerHand).toHaveBeenCalledWith('m1', 'u2');
    await waitFor(() => expect(result.current.loweringUserId).toBe('u2'));

    await act(async () => release());
    await waitFor(() => expect(result.current.loweringUserId).toBeNull());
    expect(showToast).not.toHaveBeenCalled();
  });

  it('hạ tay một người lỗi (người đã rời) → toast tiếng Việt; "Hạ tay tất cả" có cờ chờ riêng', async () => {
    jest.mocked(host.lowerHand).mockRejectedValueOnce(apiError(404, 'MEET_020'));
    const { result } = await setup();
    await act(async () => result.current.lowerHand('u9'));
    await waitFor(() => expect(showToast).toHaveBeenLastCalledWith('error', expect.stringContaining('không còn trong phòng')));

    let release: () => void = () => undefined;
    jest.mocked(host.lowerAllHands).mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    await act(async () => result.current.lowerAllHands());
    await waitFor(() => expect(result.current.lowerAllPending).toBe(true));
    await act(async () => release());
    await waitFor(() => expect(result.current.lowerAllPending).toBe(false));
  });

  it('lỗi từ server (người đã rời) → toast tiếng Việt, không đổi state', async () => {
    jest.mocked(host.mute).mockRejectedValueOnce(apiError(404, 'MEET_020'));
    const { result } = await setup();
    await act(async () => result.current.mute('u9', 'MICROPHONE'));
    expect(showToast).toHaveBeenLastCalledWith('error', expect.stringContaining('không còn trong phòng'));
  });

  it('canChangeRole: chỉ CHỦ TRÌ, và chỉ với người KHÔNG phải chủ trì/đồng chủ trì THEO LỊCH', async () => {
    const { result } = await setup('HOST');
    expect(result.current.canChangeRole('u2')).toBe(true);
    expect(result.current.canChangeRole('c1')).toBe(false); // đồng chủ trì theo lịch: vai trò lịch không đổi trong phòng
    expect(result.current.canChangeRole('h1')).toBe(false);
    expect(result.current.canChangeRole('khach-link')).toBe(true); // vào bằng link, không có trong lịch
  });

  it('canChangeRole: đồng chủ trì KHÔNG đổi được vai trò của ai (chỉ chủ trì)', async () => {
    const { result } = await setup('CO_HOST');
    expect(result.current.canChangeRole('u2')).toBe(false);
  });
});
