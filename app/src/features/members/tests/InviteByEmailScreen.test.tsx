import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { invitationsService, workspaceAccessService, type WorkspaceAccessSlice } from '../api';
import { InviteByEmailScreen } from '../screens/InviteByEmailScreen';
import { apiError, renderWithProviders } from './test-utils';

/**
 * `InviteByEmailScreen` (app.md p3-04 §3, §8) — khoá hợp đồng be.md §3–§4: payload gửi lên,
 * "Đã gửi N · Bỏ qua M", 429 đếm ngược NGAY TRONG form (không toast).
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
    invitationsService: { ...actual.invitationsService, inviteMembers: jest.fn() },
    workspaceAccessService: { get: jest.fn() },
  };
});

const mockedInviteMembers = jest.mocked(invitationsService.inviteMembers);
const mockedAccess = jest.mocked(workspaceAccessService.get);

const OWNER_ACCESS: WorkspaceAccessSlice = { myRole: 'OWNER', myPermissions: { canInvite: true } };
const PLACEHOLDER = 'ten@congty.com, ten2@congty.com';

beforeEach(() => {
  jest.clearAllMocks();
  mockedAccess.mockResolvedValue(OWNER_ACCESS);
});

describe('InviteByEmailScreen', () => {
  it('gửi mảng email + Idempotency-Key theo lần mở form; kết quả "Đã gửi 1 · Bỏ qua 1" kèm lý do từng email', async () => {
    mockedInviteMembers.mockResolvedValue({
      created: [{ id: 'i1', email: 'a@x.com' } as never],
      skipped: [{ email: 'b@x.com', reason: 'ALREADY_MEMBER' }],
    });
    await renderWithProviders(<InviteByEmailScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'a@x.com, b@x.com ');
    await fireEvent.press(await screen.findByText('Gửi lời mời (2)'));

    await waitFor(() =>
      expect(mockedInviteMembers).toHaveBeenCalledWith(
        'ws-1',
        { emails: ['a@x.com', 'b@x.com'], message: undefined },
        expect.stringMatching(/^invite-email-/),
      ),
    );
    expect(await screen.findByText('Đã gửi 1 · Bỏ qua 1')).toBeOnTheScreen();
    expect(screen.getByText('b@x.com — đã là thành viên')).toBeOnTheScreen();
  });

  it('còn chip sai định dạng → KHOÁ nút Gửi (không gửi cả lô có địa chỉ hỏng)', async () => {
    await renderWithProviders(<InviteByEmailScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'khong-phai-email a@x.com ');
    await fireEvent.press(await screen.findByText('Gửi lời mời (2)'));

    expect(mockedInviteMembers).not.toHaveBeenCalled();
  });

  it('429 kèm Retry-After → lỗi ngay trong form + đếm ngược, bấm lại không gửi', async () => {
    mockedInviteMembers.mockRejectedValue(apiError(429, 'RATE_003', { headers: { 'retry-after': '12' } }));
    await renderWithProviders(<InviteByEmailScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'a@x.com ');
    await fireEvent.press(await screen.findByText('Gửi lời mời (1)'));

    expect(await screen.findByText('Thử lại sau 12 giây')).toBeOnTheScreen();
    expect(screen.getByText('Vượt giới hạn tác vụ theo giờ, vui lòng thử lại sau')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Thử lại sau 12 giây'));
    expect(mockedInviteMembers).toHaveBeenCalledTimes(1);
  });

  it('không có myPermissions.canInvite → cảnh báo, không gửi được', async () => {
    mockedAccess.mockResolvedValue({ ...OWNER_ACCESS, myRole: 'MEMBER', myPermissions: { canInvite: false } });
    await renderWithProviders(<InviteByEmailScreen />);

    expect(await screen.findByText('Bạn chưa được mời người khác')).toBeOnTheScreen();
  });
});
