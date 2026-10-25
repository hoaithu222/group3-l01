import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useAuthStore } from '@/shell/store/slices/auth';

import { invitesService, type InvitePreview } from '../api';
import { InviteLandingScreen } from '../screens/InviteLandingScreen';
import { apiError, renderWithProviders } from './test-utils';

/**
 * `InviteLandingScreen` (p3-04): người đã đăng nhập, chưa ở trong nhóm, có ô "Lời nhắn cho quản trị viên" TUỲ CHỌN trước nút Tham gia.
 * BE `POST /invites/:token/accept` nhận `{ requestMessage? ≤ 500 }` và chỉ lưu khi nhóm cần duyệt (202 PENDING). Xem trước lời mời
 * KHÔNG trả `joinPolicy` ⇒ client không biết trước nhóm có duyệt không, nên ô hiện ở mọi nhóm và mô tả rõ "chỉ gửi đi nếu nhóm cần duyệt".
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ code: 'tok-link' }),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'online' }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    invitesService: { ...actual.invitesService, accept: jest.fn(), preview: jest.fn() },
  };
});

const mockedPreview = jest.mocked(invitesService.preview);
const mockedAccept = jest.mocked(invitesService.accept);

const PREVIEW: InvitePreview = {
  workspace: { id: 'ws-1', name: 'Nhóm Toán 12', avatarUrl: null, description: null },
  inviter: { name: 'Cô Lan', avatarUrl: null },
  expiresAt: '2026-10-01T00:00:00.000Z',
};
const LABEL = 'Lời nhắn cho quản trị viên (tuỳ chọn)';

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated' });
  mockedPreview.mockResolvedValue(PREVIEW);
  mockedAccept.mockResolvedValue({ alreadyMember: false, defaultChannelId: 'ch-1', workspaceId: 'ws-1' });
});

describe('InviteLandingScreen — lời nhắn xin vào nhóm', () => {
  it('hiện ô lời nhắn (tuỳ chọn, đếm ký tự, nói rõ chỉ dùng khi nhóm cần duyệt) trước nút Tham gia', async () => {
    await renderWithProviders(<InviteLandingScreen />);

    expect(await screen.findByLabelText(LABEL)).toBeOnTheScreen();
    expect(screen.getByText('0/500')).toBeOnTheScreen();
    expect(screen.getByText('Chỉ gửi đi nếu nhóm cần quản trị viên duyệt thành viên mới.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tham gia' })).toBeOnTheScreen();
  });

  it('gõ lời nhắn → bộ đếm chạy; Tham gia gửi ĐÚNG lời nhắn (đã cắt khoảng trắng) kèm token', async () => {
    await renderWithProviders(<InviteLandingScreen />);
    await screen.findByLabelText(LABEL);

    await fireEvent.changeText(screen.getByLabelText(LABEL), '  Em là học sinh lớp 12A  ');
    expect(screen.getByText('26/500')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tham gia' }));

    await waitFor(() => expect(mockedAccept).toHaveBeenCalledTimes(1));
    expect(mockedAccept).toHaveBeenCalledWith('tok-link', { requestMessage: 'Em là học sinh lớp 12A' });
  });

  it('để trống ⇒ vẫn tham gia được (không bắt buộc), KHÔNG có lời nhắn', async () => {
    await renderWithProviders(<InviteLandingScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Tham gia' }));

    await waitFor(() => expect(mockedAccept).toHaveBeenCalledWith('tok-link', { requestMessage: undefined }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({ params: { wsId: 'ws-1' }, pathname: '/workspaces/[wsId]' }),
    );
  });

  it('chỉ toàn khoảng trắng ⇒ coi như trống', async () => {
    await renderWithProviders(<InviteLandingScreen />);
    await screen.findByLabelText(LABEL);

    await fireEvent.changeText(screen.getByLabelText(LABEL), '     ');
    await fireEvent.press(screen.getByRole('button', { name: 'Tham gia' }));

    await waitFor(() => expect(mockedAccept).toHaveBeenCalledWith('tok-link', { requestMessage: undefined }));
  });

  it('quá 500 ký tự (dán dài) ⇒ báo lỗi NGAY DƯỚI ô và KHÔNG gọi accept', async () => {
    await renderWithProviders(<InviteLandingScreen />);
    await screen.findByLabelText(LABEL);

    await fireEvent.changeText(screen.getByLabelText(LABEL), 'a'.repeat(501));
    await fireEvent.press(screen.getByRole('button', { name: 'Tham gia' }));

    expect(await screen.findByText('Lời nhắn tối đa 500 ký tự')).toBeOnTheScreen();
    expect(mockedAccept).not.toHaveBeenCalled();
  });

  it('nhóm cần duyệt (202 PENDING) ⇒ chuyển sang màn chờ duyệt của ĐÚNG nhóm', async () => {
    mockedAccept.mockResolvedValue({
      alreadyMember: false,
      defaultChannelId: null,
      status: 'PENDING',
      workspaceId: 'ws-9',
    });
    await renderWithProviders(<InviteLandingScreen />);
    await screen.findByLabelText(LABEL);

    await fireEvent.changeText(screen.getByLabelText(LABEL), 'Cho em xin vào ạ');
    await fireEvent.press(screen.getByRole('button', { name: 'Tham gia' }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({ params: { wsId: 'ws-9' }, pathname: '/workspaces/pending' }),
    );
    expect(mockedAccept).toHaveBeenCalledWith('tok-link', { requestMessage: 'Cho em xin vào ạ' });
  });

  it('accept lỗi ⇒ không chuyển màn, lời nhắn còn nguyên để bấm lại', async () => {
    mockedAccept.mockRejectedValue(apiError(410, 'INV_001'));
    await renderWithProviders(<InviteLandingScreen />);
    await screen.findByLabelText(LABEL);

    await fireEvent.changeText(screen.getByLabelText(LABEL), 'Xin chào');
    await fireEvent.press(screen.getByRole('button', { name: 'Tham gia' }));

    await waitFor(() => expect(mockedAccept).toHaveBeenCalledTimes(1));
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL).props.value).toBe('Xin chào');
  });

  it('chưa đăng nhập ⇒ KHÔNG có ô lời nhắn (chỉ Đăng nhập/Tạo tài khoản)', async () => {
    useAuthStore.setState({ status: 'anonymous' });
    await renderWithProviders(<InviteLandingScreen />);

    expect(await screen.findByRole('button', { name: 'Đăng nhập để tham gia' })).toBeOnTheScreen();
    expect(screen.queryByLabelText(LABEL)).toBeNull();
  });

  it('đã là thành viên ⇒ KHÔNG có ô lời nhắn (chỉ "Mở nhóm")', async () => {
    mockedPreview.mockResolvedValue({ ...PREVIEW, alreadyMember: true });
    await renderWithProviders(<InviteLandingScreen />);

    expect(await screen.findByRole('button', { name: 'Mở nhóm' })).toBeOnTheScreen();
    expect(screen.queryByLabelText(LABEL)).toBeNull();
  });
});
