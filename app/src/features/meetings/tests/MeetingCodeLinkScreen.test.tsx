import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Redirect, router } from 'expo-router';

import { useAuthStore } from '@/shell/store/slices/auth';

import { meetingsService } from '../api/meetings.service';
import { MeetingCodeLinkScreen } from '../screens/MeetingCodeLinkScreen';
import { apiError, renderWithProviders } from './render-helpers';

/**
 * Đích của link chia sẻ họp `/m/<mã>`: giải mã rồi mở chi tiết cuộc họp; mã sai/không đủ quyền chỉ báo TRUNG TÍNH (chống dò mã);
 * lỗi mạng có "Thử lại"; chưa đăng nhập thì KHÔNG gọi API mà về màn đăng nhập.
 */
jest.mock('expo-router', () => ({
  Redirect: jest.fn(() => null),
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
}));
// `authEnabled` mặc định TẮT khi chạy test — bật lên để nhánh hàng rào đăng nhập có nghĩa.
jest.mock('@/core/config/env.config', () => {
  const actual = jest.requireActual('@/core/config/env.config');
  return { ...actual, appConfig: { ...actual.appConfig, authEnabled: true } };
});
jest.mock('../api/meetings.service', () => ({ meetingsService: { resolve: jest.fn() } }));

const resolve = jest.mocked(meetingsService.resolve);
const CODE = 'abc-defg-hjk';
/** `useResolveMeetingCode` tự thử lại 1 lần (`retry: 1`, chờ ~1s) trước khi báo lỗi. */
const SLOW = { timeout: 5000 };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated', user: { id: 'me' } } as never);
});

describe('MeetingCodeLinkScreen', () => {
  it('mã hợp lệ và được phép ⇒ chuyển sang chi tiết cuộc họp theo meetingId đã giải mã', async () => {
    resolve.mockResolvedValue({ allowed: true, meetingId: 'meeting9', target: 'DETAIL' });
    await renderWithProviders(<MeetingCodeLinkScreen code={CODE} />);

    await waitFor(() =>
      expect(Redirect).toHaveBeenLastCalledWith(
        { href: { pathname: '/meetings/[meetingId]', params: { meetingId: 'meeting9' } } },
        undefined,
      ),
    );
    expect(resolve).toHaveBeenCalledWith(CODE);
  });

  it('allowed=false ⇒ "Cuộc họp không còn khả dụng" (không lộ lý do) + nút về lịch họp', async () => {
    resolve.mockResolvedValue({ allowed: false, reason: 'NOT_AVAILABLE' });
    await renderWithProviders(<MeetingCodeLinkScreen code={CODE} />);

    expect(await screen.findByText('Cuộc họp không còn khả dụng')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Về lịch họp'));
    expect(router.replace).toHaveBeenCalledWith('/meetings');
  });

  it('404 (mã không có thật/đã xoá) ⇒ cũng là "không còn khả dụng", KHÔNG hiện Thử lại vô ích', async () => {
    resolve.mockRejectedValue(apiError(404, 'MEET_001'));
    await renderWithProviders(<MeetingCodeLinkScreen code={CODE} />);

    expect(await screen.findByText('Cuộc họp không còn khả dụng', {}, SLOW)).toBeOnTheScreen();
    expect(screen.queryByText('Thử lại')).toBeNull();
  });

  it('lỗi mạng ⇒ "Không mở được cuộc họp" + "Thử lại" gọi lại API', async () => {
    // Hai lần reject: lần gốc + lần tự thử lại của React Query (`retry: 1`); lần thứ ba là do người dùng bấm "Thử lại".
    resolve
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ allowed: false });
    await renderWithProviders(<MeetingCodeLinkScreen code={CODE} />);

    expect(await screen.findByText('Không mở được cuộc họp', {}, SLOW)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Thử lại'));

    expect(await screen.findByText('Cuộc họp không còn khả dụng')).toBeOnTheScreen();
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('chưa đăng nhập ⇒ về màn đăng nhập và KHÔNG gọi API giải mã', async () => {
    useAuthStore.setState({ status: 'unauthenticated', user: null } as never);
    await renderWithProviders(<MeetingCodeLinkScreen code={CODE} />);

    expect(Redirect).toHaveBeenLastCalledWith({ href: '/login' }, undefined);
    expect(resolve).not.toHaveBeenCalled();
  });
});
