import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { guestsService, invitationsService, workspaceAccessService, type WorkspaceAccessSlice } from '../api';
import { InviteGuestScreen } from '../screens/InviteGuestScreen';
import { apiError, renderWithProviders } from './test-utils';

/**
 * `InviteGuestScreen` (app.md p3-04 §3, §8): payload đúng `inviteGuestSchema`, số ngày bị
 * chặn bởi `guestPolicy.maxDays`, mã lỗi (số CUỐI sau D-28) hiện ĐÚNG CHỖ.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws-1' }),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'online' }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    guestsService: { ...actual.guestsService, listChannelOptions: jest.fn() },
    invitationsService: { ...actual.invitationsService, inviteGuest: jest.fn() },
    workspaceAccessService: { get: jest.fn() },
  };
});

const mockedInviteGuest = jest.mocked(invitationsService.inviteGuest);
const mockedChannels = jest.mocked(guestsService.listChannelOptions);
const mockedAccess = jest.mocked(workspaceAccessService.get);

const OWNER_ACCESS: WorkspaceAccessSlice = {
  myRole: 'OWNER',
  myPermissions: { canInvite: true },
  guestPolicy: { enabled: true, maxGuests: 20, maxDays: 60, memberCanInvite: false },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedAccess.mockResolvedValue(OWNER_ACCESS);
  mockedChannels.mockResolvedValue([
    { id: 'c1', name: 'chung', visibility: 'PUBLIC' },
    { id: 'c2', name: 'giao-vien', visibility: 'PRIVATE' },
  ]);
});

async function fillGuestForm() {
  await fireEvent.changeText(await screen.findByPlaceholderText('khach@congty.com'), 'khach@x.com');
  await fireEvent.press(await screen.findByLabelText('chung'));
  await fireEvent.press(screen.getByText('14 ngày'));
}

describe('InviteGuestScreen', () => {
  it('gửi email + kênh + số ngày đúng be.md §3 (inviteGuestSchema); xong thì toast và quay lại', async () => {
    mockedInviteGuest.mockResolvedValue({ id: 'i2' } as never);
    await renderWithProviders(<InviteGuestScreen />);
    await fillGuestForm();

    await fireEvent.press(screen.getByText('Gửi lời mời khách'));

    await waitFor(() =>
      expect(mockedInviteGuest).toHaveBeenCalledWith(
        'ws-1',
        { email: 'khach@x.com', channelIds: ['c1'], days: 14, message: undefined },
        expect.stringMatching(/^invite-guest-/),
      ),
    );
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('success', 'Đã gửi lời mời khách tới khach@x.com.');
  });

  it('số ngày bị chặn bởi guestPolicy.maxDays của nhóm (60): không có mốc 90', async () => {
    await renderWithProviders(<InviteGuestScreen />);

    expect(await screen.findByText('60 ngày')).toBeOnTheScreen();
    // Trước khi chính sách của nhóm về, mốc còn theo trần hệ thống (90) — chờ nó thu lại.
    await waitFor(() => expect(screen.queryByText('90 ngày')).toBeNull());
  });

  it('chưa chọn kênh → khoá nút (≥ 1 kênh)', async () => {
    await renderWithProviders(<InviteGuestScreen />);
    await fireEvent.changeText(await screen.findByPlaceholderText('khach@congty.com'), 'khach@x.com');

    await fireEvent.press(screen.getByText('Gửi lời mời khách'));

    expect(mockedInviteGuest).not.toHaveBeenCalled();
  });

  it('CH_013 (kênh riêng không quản lý) → lỗi ngay dưới danh sách kênh, không phải toast', async () => {
    mockedInviteGuest.mockRejectedValue(apiError(403, 'CH_013'));
    await renderWithProviders(<InviteGuestScreen />);
    await fillGuestForm();

    await fireEvent.press(screen.getByText('Gửi lời mời khách'));

    expect(await screen.findByText(/Bạn chỉ chỉ định được kênh riêng tư mà mình quản lý/)).toBeOnTheScreen();
  });

  it('INV_011 (đã là thành viên) → lỗi dưới ô email', async () => {
    mockedInviteGuest.mockRejectedValue(apiError(409, 'INV_011'));
    await renderWithProviders(<InviteGuestScreen />);
    await fillGuestForm();

    await fireEvent.press(screen.getByText('Gửi lời mời khách'));

    expect(await screen.findByText('Người này đã là thành viên của nhóm.')).toBeOnTheScreen();
  });

  it('nhóm chưa bật mời khách → banner + "Mở cài đặt" (OWNER) dẫn tới settings/access', async () => {
    mockedAccess.mockResolvedValue({ ...OWNER_ACCESS, guestPolicy: { ...OWNER_ACCESS.guestPolicy!, enabled: false } });
    await renderWithProviders(<InviteGuestScreen />);

    await fireEvent.press(await screen.findByText('Mở cài đặt'));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/workspaces/[wsId]/settings/access', params: { wsId: 'ws-1' } });
  });

  it('không phải OWNER/ADMIN → thông báo, không có form gửi được', async () => {
    mockedAccess.mockResolvedValue({ ...OWNER_ACCESS, myRole: 'MEMBER', myPermissions: { canInvite: true } });
    await renderWithProviders(<InviteGuestScreen />);

    expect(await screen.findByText('Bạn chưa mời được khách')).toBeOnTheScreen();
  });
});
