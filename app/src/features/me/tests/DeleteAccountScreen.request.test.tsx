import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AxiosError, type AxiosResponse } from 'axios';
import { router } from 'expo-router';

import { getRefreshToken, setRefreshToken } from '@/core/api/session';
import { DeleteAccountScreen } from '@/features/me/screens/DeleteAccountScreen';
import { clearExplicitLogout, wasExplicitLogout } from '@/shell/session/logout-intent';
import { useAuthStore } from '@/shell/store/slices/auth';

import { renderWithProviders } from './render-with-providers';

/**
 * `DeleteAccountScreen` — luồng yêu cầu xoá tài khoản (ân hạn).
 *
 * ⛔ BE thu hồi MỌI phiên ngay khi nhận yêu cầu và chặn tài khoản `PENDING_DELETION` ở tầng xác
 * thực (403 `AUTH_012`) — nên THÀNH CÔNG = phiên chết: dọn phiên rồi sang "Khôi phục tài khoản".
 * Bản test cũ khẳng định màn hình "ở lại, chuyển sang trạng thái Đang chờ xoá" — giả định sai với
 * BE (mọi request sau đó đều hỏng), nên đã thay bằng hành vi đúng.
 */

jest.mock('expo-router', () => {
  const router = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
  return { router, useRouter: () => router };
});

const mockedRequestAccountDeletion = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      requestAccountDeletion: (...args: unknown[]) => mockedRequestAccountDeletion(...args),
    },
  };
});

function httpError(status: number, code: string): AxiosError {
  const response = {
    data: { error: { code, message: 'msg' } },
    status,
  } as unknown as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

const GRACE_UNTIL = '2026-09-23T12:00:00.000Z';

beforeEach(async () => {
  jest.clearAllMocks();
  clearExplicitLogout();
  await setRefreshToken('refresh-1');
  useAuthStore.getState().setAuth({
    token: 'token',
    user: {
      email: 'nguoi-dung@vidu.com',
      id: 'user-1',
      name: 'Người dùng',
      permissions: [],
      roles: [],
    },
  });
});

async function typePasswordAndOpenDialog(password = 'mat-khau-dung') {
  await fireEvent.changeText(await screen.findByLabelText('Mật khẩu'), password);
  await fireEvent.press(screen.getByText('Yêu cầu xoá tài khoản'));
  await screen.findByText('Yêu cầu xoá tài khoản?');
}

it('bấm nút xoá KHÔNG kèm mật khẩu ⇒ không mở dialog, không gọi API', async () => {
  await renderWithProviders(<DeleteAccountScreen />);

  await fireEvent.press(await screen.findByText('Yêu cầu xoá tài khoản'));

  expect(screen.queryByText('Yêu cầu xoá tài khoản?')).toBeNull();
  expect(mockedRequestAccountDeletion).not.toHaveBeenCalled();
});

it('cảnh báo nói ĐÚNG hậu quả: bị đăng xuất khỏi mọi thiết bị (không hứa "dùng bình thường")', async () => {
  await renderWithProviders(<DeleteAccountScreen />);

  await screen.findByText(/bị đăng xuất khỏi mọi thiết bị/);
  expect(screen.queryByText(/dùng ứng dụng bình thường/)).toBeNull();
});

it('Dialog mở TRƯỚC (API chưa gọi) → "Xác nhận" gọi API đúng payload → phiên bị dọn → sang Khôi phục tài khoản', async () => {
  mockedRequestAccountDeletion.mockResolvedValue({
    deletionGraceUntil: GRACE_UNTIL,
    status: 'PENDING_DELETION',
  });
  await renderWithProviders(<DeleteAccountScreen />);

  await typePasswordAndOpenDialog();
  expect(mockedRequestAccountDeletion).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText('Xác nhận'));

  await waitFor(() =>
    expect(mockedRequestAccountDeletion).toHaveBeenCalledWith({ password: 'mat-khau-dung' }),
  );
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith({
      params: { email: 'nguoi-dung@vidu.com', until: GRACE_UNTIL },
      pathname: '/restore-account',
    }),
  );
  // Phiên chết THẬT: token, hồ sơ, refresh token trong kho khoá đều mất; đánh dấu đăng xuất chủ ý.
  expect(useAuthStore.getState().token).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
  expect(await getRefreshToken()).toBeNull();
  expect(wasExplicitLogout()).toBe(true);
});

it('sai mật khẩu ⇒ lỗi NGAY dưới form, dialog đóng, phiên GIỮ NGUYÊN, không điều hướng', async () => {
  mockedRequestAccountDeletion.mockRejectedValue(httpError(401, 'AUTH_001'));
  await renderWithProviders(<DeleteAccountScreen />);
  await typePasswordAndOpenDialog('mat-khau-sai');

  await fireEvent.press(screen.getByText('Xác nhận'));

  await screen.findByText('Mật khẩu không đúng.');
  expect(screen.queryByText('Yêu cầu xoá tài khoản?')).toBeNull();
  expect(useAuthStore.getState().token).toBe('token');
  expect(router.replace).not.toHaveBeenCalled();

  // Sửa lại ô mật khẩu ⇒ lỗi cũ biến mất, đừng báo điều không còn đúng.
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'mat-khau-khac');
  await waitFor(() => expect(screen.queryByText('Mật khẩu không đúng.')).toBeNull());
});

it('USER_010 (còn là chủ nhóm) ⇒ hiện lối tới danh sách nhóm', async () => {
  mockedRequestAccountDeletion.mockRejectedValue(httpError(409, 'USER_010'));
  await renderWithProviders(<DeleteAccountScreen />);
  await typePasswordAndOpenDialog();

  await fireEvent.press(screen.getByText('Xác nhận'));

  await screen.findByText(/chủ sở hữu nhóm/);
  await fireEvent.press(screen.getByText('Xem danh sách nhóm'));
  expect(router.push).toHaveBeenCalledWith('/workspaces');
  expect(useAuthStore.getState().token).toBe('token');
});
