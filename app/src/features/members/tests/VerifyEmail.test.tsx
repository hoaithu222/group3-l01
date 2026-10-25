import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { authService } from '@/core/api/auth';
import { BAD_CODE_MESSAGE, RESEND_COOLDOWN_SECONDS } from '@/shared/verify-email';
import { useAuthStore } from '@/shell/store/slices/auth';

import { invitationsService, type InvitationPreview } from '../api';
import { AcceptInvitationScreen } from '../screens/AcceptInvitationScreen';
import { pendingInviteStore } from '../store/pending-invite';
import { apiError, renderWithProviders } from './test-utils';

/**
 * p3-04 app.md §3 `INV_008` `EMAIL_NOT_VERIFIED`: nút "Xác minh email" → tấm gửi mã 6 số → nhập mã → xong tự chấp nhận lại lời mời (không bắt bấm "Thử lại").
 * Lỗi hiện NGAY TRONG tấm (không toast). BE trả 400 `VAL_001` cho cả "Email đã được xác minh" lẫn "mã sai" — phân biệt bằng câu gốc của BE.
 */
jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ token: 'tok-secret' }),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'online' }));
jest.mock('@/shell/session/useLogout', () => ({
  useLogout: () => ({ isPending: false, logout: jest.fn() }),
}));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    invitationsService: { ...actual.invitationsService, accept: jest.fn(), preview: jest.fn() },
  };
});

const preview = jest.mocked(invitationsService.preview);
const accept = jest.mocked(invitationsService.accept);
const sendCode = jest.spyOn(authService, 'sendEmailVerification');
const confirmCode = jest.spyOn(authService, 'confirmEmailVerification');

const PREVIEW: InvitationPreview = {
  workspace: { name: 'Nhóm Toán 12', avatarUrl: null },
  invitedBy: { name: 'Cô Lan' },
  role: 'MEMBER',
  guestDays: null,
  expiresAt: '2026-10-01T00:00:00.000Z',
  emailHint: 'l***@gmail.com',
  status: 'PENDING',
};
const ACCEPTED = {
  workspaceId: 'ws-9',
  membership: { role: 'MEMBER', status: 'ACTIVE', expiresAt: null },
} as const;

/** Lỗi 400 `VAL_001` với câu gốc của BE (`ValidationError`) — `apiError` chung đặt `message = code` nên không dùng được. */
function validationError(message: string) {
  return Object.assign(new Error('HTTP 400'), {
    isAxiosError: true,
    response: { data: { error: { code: 'VAL_001', message } }, headers: {}, status: 400 },
  });
}

/** Tới tấm "Xác minh email": Tham gia → INV_008 EMAIL_NOT_VERIFIED → "Xác minh email". */
async function openSheet() {
  preview.mockResolvedValue(PREVIEW);
  accept.mockRejectedValueOnce(
    apiError(403, 'INV_008', { details: { reason: 'EMAIL_NOT_VERIFIED' } }),
  );
  await renderWithProviders(<AcceptInvitationScreen />);
  await fireEvent.press(await screen.findByText('Tham gia'));
  await fireEvent.press(await screen.findByText('Xác minh email'));
  expect(await screen.findByText('Gửi mã 6 số tới l***@gmail.com.')).toBeOnTheScreen();
}

const typeCode = (code: string) =>
  fireEvent.changeText(screen.getByLabelText('Mã gồm 6 chữ số'), code);

beforeEach(async () => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated' });
  await pendingInviteStore.clear();
  sendCode.mockResolvedValue(undefined);
  confirmCode.mockResolvedValue(undefined);
  accept.mockResolvedValue(ACCEPTED);
});

describe('AcceptInvitationScreen — Xác minh email', () => {
  it('lỗi EMAIL_NOT_VERIFIED có CẢ "Xác minh email" và "Thử lại"', async () => {
    preview.mockResolvedValue(PREVIEW);
    accept.mockRejectedValueOnce(
      apiError(403, 'INV_008', { details: { reason: 'EMAIL_NOT_VERIFIED' } }),
    );
    await renderWithProviders(<AcceptInvitationScreen />);
    await fireEvent.press(await screen.findByText('Tham gia'));

    expect(await screen.findByText('Cần xác minh email')).toBeOnTheScreen();
    expect(screen.getByText('Xác minh email')).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeOnTheScreen();
  });

  it('gửi mã → nhập đủ 6 số → xác nhận → TỰ chấp nhận lại lời mời và vào nhóm', async () => {
    await openSheet();
    await fireEvent.press(screen.getByText('Gửi mã'));

    expect(await screen.findByText('Nhập mã 6 số đã gửi tới l***@gmail.com.')).toBeOnTheScreen();
    expect(sendCode).toHaveBeenCalledTimes(1);

    await typeCode('123456');

    await waitFor(() => expect(confirmCode).toHaveBeenCalledWith('123456'));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        params: { wsId: 'ws-9' },
        pathname: '/workspaces/[wsId]',
      }),
    );
  });

  it('mã sai (400 VAL_001): lỗi NGAY TRONG tấm, ô mã được xoá để nhập lại, KHÔNG chấp nhận lời mời', async () => {
    confirmCode.mockRejectedValueOnce(validationError('Mã xác minh không hợp lệ hoặc đã hết hạn'));
    await openSheet();
    await fireEvent.press(screen.getByText('Gửi mã'));
    await screen.findByText('Nhập mã 6 số đã gửi tới l***@gmail.com.');

    await typeCode('000000');

    expect(await screen.findByText(BAD_CODE_MESSAGE)).toBeOnTheScreen();
    expect(accept).toHaveBeenCalledTimes(1); // chỉ lượt đầu (đã lỗi)
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('BE báo "Email đã được xác minh" ngay lúc gửi mã (xác minh ở nơi khác) → coi như xong, tự chấp nhận', async () => {
    sendCode.mockRejectedValueOnce(validationError('Email đã được xác minh'));
    await openSheet();
    await fireEvent.press(screen.getByText('Gửi mã'));

    await waitFor(() => expect(accept).toHaveBeenCalledTimes(2));
    expect(confirmCode).not.toHaveBeenCalled();
  });

  it('gửi quá nhiều lần (429): lỗi hiện trong tấm, vẫn ở bước gửi mã', async () => {
    sendCode.mockRejectedValueOnce(
      apiError(429, 'RATE_002', { headers: { 'retry-after': '900' } }),
    );
    await openSheet();
    await fireEvent.press(screen.getByText('Gửi mã'));

    expect(
      await screen.findByText('Bạn thao tác quá nhanh, vui lòng thử lại sau'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Gửi mã 6 số tới l***@gmail.com.')).toBeOnTheScreen();
  });

  it('"Tôi đã có mã" sang bước nhập mã mà KHÔNG gửi lại (BE chỉ cho 3 lần/15 phút)', async () => {
    await openSheet();
    await fireEvent.press(screen.getByText('Tôi đã có mã'));

    expect(await screen.findByText('Nhập mã 6 số đã gửi tới l***@gmail.com.')).toBeOnTheScreen();
    expect(sendCode).not.toHaveBeenCalled();
  });

  it('sau khi gửi mã, "Gửi lại mã" bị khoá tới hết đếm ngược rồi mới bấm được', async () => {
    jest.useFakeTimers();
    try {
      await openSheet();
      await fireEvent.press(screen.getByText('Gửi mã'));

      expect(await screen.findByText(`Gửi lại mã (${RESEND_COOLDOWN_SECONDS}s)`)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: /Gửi lại mã/ })).toBeDisabled();

      // Mỗi giây là MỘT lượt vẽ lại rồi mới hẹn giây kế (effect) — phải cho React flush giữa các nhịp, không gộp một lần 30 giây.
      for (let i = 0; i < RESEND_COOLDOWN_SECONDS; i += 1) {
        await act(async () => void (await jest.advanceTimersByTimeAsync(1000)));
      }
      expect(screen.getByRole('button', { name: 'Gửi lại mã' })).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });
});
