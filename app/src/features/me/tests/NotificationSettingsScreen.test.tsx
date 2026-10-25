import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { notificationKeys, type AccountNotificationPreference } from '@/core/notifications';
import { NotificationSettingsScreen } from '@/features/me/screens/NotificationSettingsScreen';
import { usePushPermission } from '@/shell/notifications';

import { BASE_PREFERENCE, SAFE_AREA_METRICS } from './notification.fixtures';

/**
 * `app.md` §8 `NotificationSettingsScreen.test`: đổi lựa chọn LẠC QUAN + hoàn về khi lỗi; DND chọn thời lượng;
 * quyền OS bị tắt hiện lối mở Cài đặt (PUSH-11). ⛔ KHÔNG bấm "Quay lại" của `AppBar` (router.back thật).
 */

const mockedGet = jest.fn();
const mockedUpdate = jest.fn();
jest.mock('@/core/notifications', () => {
  const actual = jest.requireActual('@/core/notifications');
  return {
    ...actual,
    notificationPreferencesService: {
      getAccount: (...args: unknown[]) => mockedGet(...args),
      updateAccount: (...args: unknown[]) => mockedUpdate(...args),
    },
  };
});
jest.mock('@/shell/notifications', () => ({ usePushPermission: jest.fn() }));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'connected' }));

const mockedPermission = jest.mocked(usePushPermission);
const mockedEnable = jest.fn();
const mockedOpenSettings = jest.fn();

function permissionIs(permission: 'denied' | 'granted' | 'undetermined' | null) {
  mockedPermission.mockReturnValue({
    enable: mockedEnable,
    openSettings: mockedOpenSettings,
    permission,
  } as never);
}

let queryClient: QueryClient;

async function renderScreen() {
  queryClient = new QueryClient({
    // `mutations.gcTime: 0`: không thì mỗi mutation để lại timer gc 5 phút, Jest chạy đơn lẻ không thoát được.
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  return render(<NotificationSettingsScreen />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  permissionIs('granted');
  mockedGet.mockResolvedValue(BASE_PREFERENCE);
});

describe('quyền của hệ điều hành', () => {
  it('chưa hỏi → nút "Bật thông báo" gọi hộp thoại hệ thống', async () => {
    permissionIs('undetermined');
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: 'Bật thông báo' }));
    expect(mockedEnable).toHaveBeenCalledTimes(1);
    expect(mockedOpenSettings).not.toHaveBeenCalled();
  });

  it('PUSH-11: đã từ chối → nói rõ "tắt trong Cài đặt hệ thống" + nút mở Cài đặt, KHÔNG hộp thoại lặp', async () => {
    permissionIs('denied');
    await renderScreen();

    expect(await screen.findByText(/Đang tắt trong Cài đặt hệ thống/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mở Cài đặt hệ thống' }));

    expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
    expect(mockedEnable).not.toHaveBeenCalled();
  });

  it('đã bật → không có nút hành động nào', async () => {
    await renderScreen();
    await screen.findByText('Đang bật');
    expect(screen.queryByRole('button', { name: 'Bật thông báo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mở Cài đặt hệ thống' })).toBeNull();
  });
});

describe('màn hình khoá', () => {
  it('hiện giá trị hiệu lực từ BE (mặc định: ẩn nội dung)', async () => {
    await renderScreen();
    await screen.findByText('Ẩn nội dung');
    expect(screen.getByText('Chỉ hiện tên người gửi')).toBeOnTheScreen();
    expect(screen.getByText('Xem trước nội dung')).toBeOnTheScreen();
  });

  it('chọn "Xem trước nội dung" → PUT đúng body, cập nhật lạc quan rồi ghi giá trị BE trả về', async () => {
    mockedUpdate.mockResolvedValue({ ...BASE_PREFERENCE, lockScreenPreview: 'FULL' });
    await renderScreen();

    await fireEvent.press(await screen.findByText('Xem trước nội dung'));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith({ lockScreenPreview: 'FULL' }));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<AccountNotificationPreference>(notificationKeys.prefs)
          ?.lockScreenPreview,
      ).toBe('FULL'),
    );
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });

  it('lỗi từ BE → HOÀN về giá trị cũ (rollback)', async () => {
    let rejectUpdate: (error: Error) => void = () => undefined;
    mockedUpdate.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectUpdate = reject;
      }),
    );
    await renderScreen();

    await fireEvent.press(await screen.findByText('Chỉ hiện tên người gửi'));

    await waitFor(() =>
      expect(
        queryClient.getQueryData<AccountNotificationPreference>(notificationKeys.prefs)
          ?.lockScreenPreview,
      ).toBe('SENDER'),
    );

    // Lỗi tới NGOÀI luồng thao tác của người dùng (mạng trả lời sau) — bọc `act` để React ghi nhận cập nhật.
    await act(async () => rejectUpdate(new Error('Network Error')));

    await waitFor(() =>
      expect(
        queryClient.getQueryData<AccountNotificationPreference>(notificationKeys.prefs)
          ?.lockScreenPreview,
      ).toBe('HIDDEN'),
    );
  });

  it('có giải thích rủi ro khi hiện nội dung trên màn hình khoá', async () => {
    await renderScreen();
    expect(await screen.findByText(/người khác nhìn thấy đoạn đầu tin nhắn/)).toBeOnTheScreen();
  });
});

describe('Không làm phiền', () => {
  it('chọn "Trong 1 giờ" → PUT dndUntil ở tương lai, dạng ISO UTC', async () => {
    mockedUpdate.mockResolvedValue(BASE_PREFERENCE);
    await renderScreen();

    const before = Date.now();
    await fireEvent.press(await screen.findByText('Trong 1 giờ'));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [body] = mockedUpdate.mock.calls[0] as [{ dndUntil: string }];
    expect(body.dndUntil.endsWith('Z')).toBe(true);
    expect(new Date(body.dndUntil).getTime()).toBeGreaterThanOrEqual(before + 3_600_000 - 1000);
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });

  it('đang bật → hiện "Đang bật đến" + nút Tắt gửi dndUntil: null', async () => {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    mockedGet.mockResolvedValue({ ...BASE_PREFERENCE, dndUntil: until });
    mockedUpdate.mockResolvedValue(BASE_PREFERENCE);
    await renderScreen();

    await screen.findByText('Đang bật đến');
    expect(screen.queryByText('Trong 8 giờ')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Tắt' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith({ dndUntil: null }));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});

describe('trạng thái tải', () => {
  it('lỗi tải cài đặt → EmptyState + "Thử lại"; khối quyền OS vẫn hiện', async () => {
    mockedGet.mockRejectedValue(new Error('boom'));
    await renderScreen();

    expect(await screen.findByText('Không tải được cài đặt thông báo')).toBeOnTheScreen();
    expect(screen.getByText('Thông báo trên thiết bị')).toBeOnTheScreen();

    mockedGet.mockResolvedValue(BASE_PREFERENCE);
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(await screen.findByText('Ẩn nội dung')).toBeOnTheScreen();
  });
});
