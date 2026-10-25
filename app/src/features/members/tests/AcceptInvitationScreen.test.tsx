import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useAuthStore } from '@/shell/store/slices/auth';

import { invitationsService, type InvitationPreview } from '../api';
import { AcceptInvitationScreen } from '../screens/AcceptInvitationScreen';
import { pendingInviteStore, redirectToPendingInvite } from '../store/pending-invite';
import { apiError, renderWithProviders } from './test-utils';

/**
 * `AcceptInvitationScreen` (app.md p3-04 §8): lỗi hiện thành NỘI DUNG màn (không toast) vì mỗi
 * loại cần một hành động khác nhau — `INV_008` (không khớp email) cần email che + Đăng xuất,
 * `INV_010` (hết hạn) cần hướng dẫn xin lời mời mới. Mã lỗi là số CUỐI CÙNG sau D-28.
 */

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ token: 'tok-secret' }),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'online' }));

const mockedLogout = jest.fn();
jest.mock('@/shell/session/useLogout', () => ({
  useLogout: () => ({ isPending: false, logout: mockedLogout }),
}));

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    invitationsService: { ...actual.invitationsService, accept: jest.fn(), preview: jest.fn() },
  };
});

const mockedPreview = jest.mocked(invitationsService.preview);
const mockedAccept = jest.mocked(invitationsService.accept);

const PREVIEW: InvitationPreview = {
  workspace: { name: 'Nhóm Toán 12', avatarUrl: null },
  invitedBy: { name: 'Cô Lan' },
  role: 'GUEST',
  channels: [{ name: 'chung' }, { name: 'bai-tap' }],
  guestDays: 30,
  expiresAt: '2026-10-01T00:00:00.000Z',
  emailHint: 'l***@gmail.com',
  status: 'PENDING',
};

async function renderScreen() {
  await renderWithProviders(<AcceptInvitationScreen />);
}

beforeEach(async () => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated' });
  await pendingInviteStore.clear();
});

describe('AcceptInvitationScreen — đã đăng nhập', () => {
  it('INV_008 EMAIL_MISMATCH: hiện email ĐÃ CHE + Đăng xuất; đăng xuất xong vẫn giữ token để quay lại lời mời', async () => {
    mockedPreview.mockResolvedValue(PREVIEW);
    mockedAccept.mockRejectedValue(apiError(403, 'INV_008', { details: { reason: 'EMAIL_MISMATCH' } }));
    // `useLogout` thật xoá `pendingInvite` rồi mới gọi onSettled — mô phỏng đúng thứ tự đó.
    mockedLogout.mockImplementation(async (_vars: undefined, options?: { onSettled?: () => void }) => {
      await pendingInviteStore.clear();
      options?.onSettled?.();
    });

    await renderScreen();
    await fireEvent.press(await screen.findByText('Tham gia'));

    expect(await screen.findByText('Lời mời dành cho tài khoản khác')).toBeOnTheScreen();
    expect(
      screen.getByText(/Lời mời gửi tới l\*\*\*@gmail\.com\. Hãy đăng nhập đúng tài khoản\./),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Đăng xuất'));

    expect(mockedLogout).toHaveBeenCalledTimes(1);
    // Đăng nhập đúng tài khoản xong phải về lại ĐÚNG lời mời email (không phải link chung).
    await waitFor(async () => expect(await pendingInviteStore.readEntry()).toEqual({ code: 'tok-secret', kind: 'EMAIL' }));
  });

  it('INV_008 kèm reason EMAIL_NOT_VERIFIED: nói cần xác minh email + có "Thử lại"', async () => {
    mockedPreview.mockResolvedValue(PREVIEW);
    mockedAccept.mockRejectedValue(apiError(403, 'INV_008', { details: { reason: 'EMAIL_NOT_VERIFIED' } }));

    await renderScreen();
    await fireEvent.press(await screen.findByText('Tham gia'));

    expect(await screen.findByText('Cần xác minh email')).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeOnTheScreen();
    expect(screen.queryByText('Đăng xuất')).toBeNull();
  });

  it('INV_010 (410) hết hạn: hướng dẫn xin lời mời MỚI, không có nút thử lại (vô ích)', async () => {
    mockedPreview.mockResolvedValue(PREVIEW);
    mockedAccept.mockRejectedValue(apiError(410, 'INV_010'));

    await renderScreen();
    await fireEvent.press(await screen.findByText('Tham gia'));

    expect(await screen.findByText('Lời mời không còn hiệu lực')).toBeOnTheScreen();
    expect(screen.getByText(/hãy xin lời mời mới/)).toBeOnTheScreen();
    expect(screen.queryByText('Thử lại')).toBeNull();
  });

  it('bản xem trước đã 410 (lời mời hết hạn) ⇒ hiện hướng dẫn ngay, không có nút Tham gia', async () => {
    mockedPreview.mockRejectedValue(apiError(410, 'INV_010'));

    await renderScreen();

    expect(await screen.findByText('Lời mời không còn hiệu lực')).toBeOnTheScreen();
    expect(screen.queryByText('Tham gia')).toBeNull();
  });

  it('thấy vai trò khách + kênh + hạn trong bản xem trước, rồi Tham gia → vào nhóm', async () => {
    mockedPreview.mockResolvedValue(PREVIEW);
    mockedAccept.mockResolvedValue({
      workspaceId: 'ws-9',
      membership: { role: 'GUEST', status: 'ACTIVE', expiresAt: '2026-10-19T00:00:00.000Z' },
    });

    await renderScreen();

    expect(await screen.findByText('Nhóm Toán 12')).toBeOnTheScreen();
    expect(screen.getByText('Vào với tư cách khách · 30 ngày')).toBeOnTheScreen();
    expect(screen.getByText('Kênh: chung, bai-tap')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Tham gia'));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({ pathname: '/workspaces/[wsId]', params: { wsId: 'ws-9' } }),
    );
  });
});

describe('AcceptInvitationScreen — CHƯA đăng nhập', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'anonymous' });
  });

  it('chỉ thấy bản xem trước TỐI THIỂU; "Đăng nhập để tham gia" lưu token (kind EMAIL) rồi sang Đăng nhập', async () => {
    mockedPreview.mockResolvedValue(PREVIEW);

    await renderScreen();

    expect(await screen.findByText('Nhóm Toán 12')).toBeOnTheScreen();
    // Vai trò/kênh/hạn chỉ hiện SAU khi đăng nhập.
    expect(screen.queryByText(/Vào với tư cách/)).toBeNull();
    expect(screen.queryByText(/Kênh:/)).toBeNull();
    expect(screen.queryByText('Tham gia')).toBeNull();

    await fireEvent.press(screen.getByText('Đăng nhập để tham gia'));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/login'));
    expect(await pendingInviteStore.readEntry()).toEqual({ code: 'tok-secret', kind: 'EMAIL' });
  });
});

describe('pendingInviteStore / redirectToPendingInvite', () => {
  it('kind EMAIL → đưa về /invite/e/[token]; bản ghi cũ (không kind) → /invite/[code] như trước p3-04', async () => {
    await pendingInviteStore.save('tok-email', 'EMAIL');
    expect(await redirectToPendingInvite()).toBe(true);
    expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/invite/e/[token]', params: { token: 'tok-email' } });

    await pendingInviteStore.save('link-code');
    expect(await redirectToPendingInvite()).toBe(true);
    expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/invite/[code]', params: { code: 'link-code' } });

    // `read()` (API cũ) vẫn trả CHỈ phần mã.
    expect(await pendingInviteStore.read()).toBe('link-code');
  });

  it('không có bản ghi → không điều hướng', async () => {
    expect(await redirectToPendingInvite()).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
