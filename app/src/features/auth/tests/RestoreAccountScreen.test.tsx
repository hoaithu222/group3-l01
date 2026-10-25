import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { RestoreAccountScreen } from '@/features/auth/screens/RestoreAccountScreen';
import { showToast } from '@/shared/utils/toast.utils';

import { httpError, renderScreen } from './render-screen';

/**
 * "Khôi phục tài khoản" (p0-01 mục 3) — đích của `AUTH_012` khi đăng nhập và của lượt yêu cầu xoá
 * vừa xong. Huỷ yêu cầu xoá bằng email + mật khẩu (BE đã thu hồi mọi phiên nên không có token nào).
 */

jest.mock('expo-router', () => {
  const router = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() };
  return { router, useLocalSearchParams: jest.fn(), useRouter: () => router };
});
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const mockedCancel = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      cancelAccountDeletion: (...args: unknown[]) => mockedCancel(...args),
    },
  };
});

// Giờ NGỌ (12:00 UTC) — `formatDateTime` dùng giờ ĐỊA PHƯƠNG, tránh lệch ngày theo múi giờ máy chạy.
const UNTIL = '2026-09-23T12:00:00.000Z';

function setParams(params: Record<string, string | string[]>) {
  jest.mocked(useLocalSearchParams).mockReturnValue(params as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  setParams({ email: 'nguoi-dung@vidu.com', until: UNTIL });
});

async function fillPassword(password = 'mat-khau-dung') {
  await fireEvent.changeText(await screen.findByLabelText('Mật khẩu'), password);
}

describe('nội dung', () => {
  it('có `until` ⇒ nói NGÀY sẽ xoá; email điền sẵn từ tham số', async () => {
    await renderScreen(<RestoreAccountScreen />);

    await screen.findByText('Tài khoản đang chờ xoá');
    expect(screen.getByText(/23\/09\/2026/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Email').props.value).toBe('nguoi-dung@vidu.com');
  });

  it.each([[{ email: 'a@b.com' }], [{ email: 'a@b.com', until: 'khong-phai-ngay' }]])(
    'không có/không đọc được `until` ⇒ câu chung, KHÔNG hiện "Invalid Date" (%j)',
    async (params) => {
      setParams(params);
      await renderScreen(<RestoreAccountScreen />);

      await screen.findByText(/đang trong thời gian chờ xoá/);
      expect(screen.queryByText(/Invalid/i)).toBeNull();
    },
  );

  it('tham số lặp (?email=a&email=b) thành mảng ⇒ lấy phần tử đầu, không vỡ', async () => {
    setParams({ email: ['dau@vidu.com', 'sau@vidu.com'] });
    await renderScreen(<RestoreAccountScreen />);

    expect((await screen.findByLabelText('Email')).props.value).toBe('dau@vidu.com');
  });
});

describe('huỷ yêu cầu xoá', () => {
  it('gửi email (đã chuẩn hoá) + mật khẩu → toast → về Đăng nhập bằng dismissTo (không chồng màn)', async () => {
    mockedCancel.mockResolvedValue({ status: 'ACTIVE' });
    await renderScreen(<RestoreAccountScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Email'), '  NGUOI-DUNG@Vidu.com ');
    await fillPassword();

    await fireEvent.press(screen.getByText('Huỷ yêu cầu xoá'));

    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/login'));
    expect(mockedCancel).toHaveBeenCalledWith({
      email: 'nguoi-dung@vidu.com',
      password: 'mat-khau-dung',
    });
    expect(showToast).toHaveBeenCalledWith(
      'success',
      'Đã huỷ yêu cầu xoá. Hãy đăng nhập lại để tiếp tục.',
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('thiếu mật khẩu ⇒ báo tại ô, KHÔNG gọi API', async () => {
    await renderScreen(<RestoreAccountScreen />);

    await fireEvent.press(await screen.findByText('Huỷ yêu cầu xoá'));

    await waitFor(() => expect(mockedCancel).not.toHaveBeenCalled());
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('sai email/mật khẩu (401 AUTH_001) ⇒ câu rõ ràng tại form; sửa lại ô ⇒ lỗi cũ biến mất', async () => {
    mockedCancel.mockRejectedValue(httpError(401, 'AUTH_001'));
    await renderScreen(<RestoreAccountScreen />);
    await fillPassword('sai');

    await fireEvent.press(screen.getByText('Huỷ yêu cầu xoá'));

    await screen.findByText('Email hoặc mật khẩu không đúng.');
    expect(showToast).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'sai-2');
    await waitFor(() => expect(screen.queryByText('Email hoặc mật khẩu không đúng.')).toBeNull());
  });

  it('hết ân hạn (409 USER_011) ⇒ hiện đúng câu của bảng mã', async () => {
    mockedCancel.mockRejectedValue(httpError(409, 'USER_011'));
    await renderScreen(<RestoreAccountScreen />);
    await fillPassword();

    await fireEvent.press(screen.getByText('Huỷ yêu cầu xoá'));

    await screen.findByText('Tài khoản không ở trạng thái chờ xoá hoặc đã hết thời gian huỷ');
  });

  it('⛔ gửi hai lần từ bàn phím khi lượt đầu chưa xong ⇒ chỉ MỘT lượt gọi (lượt sau ăn 409 dù lượt đầu thành công)', async () => {
    let finish!: (value: unknown) => void;
    mockedCancel.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderScreen(<RestoreAccountScreen />);
    await fillPassword();

    const passwordInput = screen.getByLabelText('Mật khẩu');
    await fireEvent(passwordInput, 'submitEditing');
    await fireEvent(passwordInput, 'submitEditing');

    await waitFor(() => expect(mockedCancel).toHaveBeenCalledTimes(1));
    finish({ status: 'ACTIVE' });
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledTimes(1));
    expect(mockedCancel).toHaveBeenCalledTimes(1);
  });

  it('"Quay lại đăng nhập" ⇒ dismissTo, không push/replace', async () => {
    await renderScreen(<RestoreAccountScreen />);

    await fireEvent.press(await screen.findByLabelText('Quay lại đăng nhập'));

    expect(router.dismissTo).toHaveBeenCalledWith('/login');
    expect(router.push).not.toHaveBeenCalled();
  });
});
