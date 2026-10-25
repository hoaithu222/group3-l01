import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { invitationsService, type MyInvitationDto } from '../api';
import { MyInvitationsScreen } from '../screens/MyInvitationsScreen';
import { apiError, renderWithProviders } from './test-utils';

/**
 * "Lời mời của tôi" (p3-04, `GET /me/invitations` + `POST /me/invitations/:id/accept`): danh sách lời mời
 * gửi tới email đã xác minh, chấp nhận KHÔNG cần token. Lỗi hiện dưới dòng (không toast); kết quả điều
 * hướng như `AcceptInvitationScreen` (PENDING → màn chờ duyệt).
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'online' }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    invitationsService: { ...actual.invitationsService, acceptMine: jest.fn(), mine: jest.fn() },
  };
});

const mockedMine = jest.mocked(invitationsService.mine);
const mockedAccept = jest.mocked(invitationsService.acceptMine);

function invitation(overrides: Partial<MyInvitationDto> = {}): MyInvitationDto {
  return {
    acceptedAt: null,
    createdAt: '2026-09-20T00:00:00.000Z',
    email: 'me@x.vn',
    expiresAt: '2026-09-27T00:00:00.000Z',
    guestChannelIds: [],
    guestDays: null,
    id: 'inv-1',
    invitedBy: 'u-lan',
    inviter: { name: 'Cô Lan' },
    lastSentAt: '2026-09-20T00:00:00.000Z',
    message: null,
    role: 'MEMBER',
    sendCount: 1,
    status: 'PENDING',
    workspace: { avatarUrl: null, name: 'Nhóm Toán 12' },
    workspaceId: 'ws-1',
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('MyInvitationsScreen', () => {
  it('trống ⇒ giải thích chỉ hiện lời mời gửi tới email ĐÃ XÁC MINH', async () => {
    mockedMine.mockResolvedValue([]);
    await renderWithProviders(<MyInvitationsScreen />);

    expect(await screen.findByText('Chưa có lời mời nào')).toBeOnTheScreen();
    expect(screen.getByText(/email ĐÃ XÁC MINH/)).toBeOnTheScreen();
  });

  it('hiện nhóm, người mời, vai trò (khách kèm số ngày) và hạn', async () => {
    mockedMine.mockResolvedValue([
      invitation(),
      invitation({
        guestDays: 14,
        id: 'inv-2',
        role: 'GUEST',
        workspace: { avatarUrl: null, name: 'Nhóm Lý' },
      }),
    ]);
    await renderWithProviders(<MyInvitationsScreen />);

    expect(await screen.findByText('Nhóm Toán 12')).toBeOnTheScreen();
    expect(screen.getByText('Cô Lan mời bạn · Thành viên')).toBeOnTheScreen();
    expect(screen.getByText('Cô Lan mời bạn · Khách · 14 ngày')).toBeOnTheScreen();
    expect(screen.getAllByText(/^Hết hạn /)).toHaveLength(2);
  });

  it('"Tham gia" gọi chấp nhận theo id (không token) rồi vào thẳng nhóm', async () => {
    mockedMine.mockResolvedValue([invitation()]);
    mockedAccept.mockResolvedValue({
      membership: { role: 'MEMBER', status: 'ACTIVE' },
      workspaceId: 'ws-1',
    });
    await renderWithProviders(<MyInvitationsScreen />);

    await fireEvent.press(await screen.findByLabelText('Tham gia nhóm Nhóm Toán 12'));

    await waitFor(() => expect(mockedAccept).toHaveBeenCalledWith('inv-1'));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        params: { wsId: 'ws-1' },
        pathname: '/workspaces/[wsId]',
      }),
    );
  });

  it('nhóm duyệt thành viên mới (status PENDING) ⇒ sang màn chờ duyệt', async () => {
    mockedMine.mockResolvedValue([invitation()]);
    mockedAccept.mockResolvedValue({
      membership: { role: 'MEMBER', status: 'PENDING' },
      workspaceId: 'ws-1',
    });
    await renderWithProviders(<MyInvitationsScreen />);

    await fireEvent.press(await screen.findByLabelText('Tham gia nhóm Nhóm Toán 12'));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        params: { wsId: 'ws-1' },
        pathname: '/workspaces/pending',
      }),
    );
  });

  it('410 INV_010 (hết hạn/thu hồi) ⇒ câu hướng dẫn NGAY DƯỚI dòng, không điều hướng', async () => {
    mockedMine.mockResolvedValue([invitation()]);
    mockedAccept.mockRejectedValue(apiError(410, 'INV_010'));
    await renderWithProviders(<MyInvitationsScreen />);

    await fireEvent.press(await screen.findByLabelText('Tham gia nhóm Nhóm Toán 12'));

    expect(
      await screen.findByText('Lời mời đã hết hạn hoặc đã bị thu hồi — hãy xin lời mời mới.'),
    ).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('lỗi tải ⇒ "Không tải được lời mời" + Thử lại', async () => {
    mockedMine.mockRejectedValue(apiError(500, 'SYS_001'));
    await renderWithProviders(<MyInvitationsScreen />);

    expect(await screen.findByText('Không tải được lời mời')).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeOnTheScreen();
  });
});
