import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { DeviceSummary } from '@/core/notifications';
import {
  DEVICES_EMPTY_TITLE,
  DEVICES_REMOVE_DIALOG_TITLE,
} from '@/features/me/constants/notification.messages';
import { DevicesScreen } from '@/features/me/screens/DevicesScreen';
import { showToast } from '@/shared/utils/toast.utils';

/**
 * `app.md` §8 màn "Thiết bị": danh sách, nhãn "Thiết bị này" không có nút Gỡ, Gỡ phải qua hộp thoại xác nhận,
 * rỗng/lỗi/offline.
 */

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
const mockedToast = jest.mocked(showToast);

const mockedList = jest.fn();
const mockedRemove = jest.fn();
jest.mock('@/core/notifications', () => {
  const actual = jest.requireActual('@/core/notifications');
  return {
    ...actual,
    devicesService: {
      list: (...args: unknown[]) => mockedList(...args),
      remove: (...args: unknown[]) => mockedRemove(...args),
    },
  };
});

let mockedConnection: 'connected' | 'offline' = 'connected';
jest.mock('@/core/socket', () => ({ useConnectionState: () => mockedConnection }));

const THIS_DEVICE: DeviceSummary = {
  appVersion: '0.1.0',
  current: true,
  deviceId: 'device-this-0001',
  kinds: ['FCM'],
  lastSeenAt: '2026-09-21T08:00:00.000Z',
  platform: 'ANDROID',
};
const OTHER_DEVICE: DeviceSummary = {
  appVersion: '0.0.9',
  current: false,
  deviceId: 'device-other-0002',
  kinds: ['FCM', 'APNS_VOIP'],
  lastSeenAt: '2026-09-15T08:00:00.000Z',
  platform: 'IOS',
};

const SAFE_AREA_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

async function renderScreen() {
  const queryClient = new QueryClient({
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
  return render(<DevicesScreen />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedConnection = 'connected';
});

describe('DevicesScreen', () => {
  it('hiện danh sách; thiết bị hiện tại có nhãn "Thiết bị này" và KHÔNG có nút Gỡ', async () => {
    mockedList.mockResolvedValue([THIS_DEVICE, OTHER_DEVICE]);
    await renderScreen();

    await screen.findByText('Thiết bị này');
    expect(screen.getByText('Android')).toBeOnTheScreen();
    expect(screen.getByText('iPhone / iPad')).toBeOnTheScreen();
    // Chỉ MỘT nút Gỡ — của máy khác.
    expect(screen.getAllByText('Gỡ')).toHaveLength(1);
  });

  it('bấm Gỡ → phải qua hộp thoại xác nhận rồi mới gọi DELETE đúng deviceId', async () => {
    mockedList.mockResolvedValue([THIS_DEVICE, OTHER_DEVICE]);
    mockedRemove.mockResolvedValue({ revoked: 2 });
    await renderScreen();

    await fireEvent.press(await screen.findByText('Gỡ'));
    await screen.findByText(DEVICES_REMOVE_DIALOG_TITLE);
    expect(mockedRemove).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Xác nhận'));

    await waitFor(() => expect(mockedRemove).toHaveBeenCalledWith('device-other-0002'));
    await waitFor(() => expect(mockedToast).toHaveBeenCalledWith('success', 'Đã gỡ thiết bị.'));
    await waitFor(() => expect(screen.queryByText(DEVICES_REMOVE_DIALOG_TITLE)).toBeNull());
  });

  it('"Huỷ" trong hộp thoại → không gọi API', async () => {
    mockedList.mockResolvedValue([OTHER_DEVICE]);
    await renderScreen();

    await fireEvent.press(await screen.findByText('Gỡ'));
    await fireEvent.press(await screen.findByText('Huỷ'));

    expect(mockedRemove).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(DEVICES_REMOVE_DIALOG_TITLE)).toBeNull());
  });

  it('danh sách rỗng → EmptyState', async () => {
    mockedList.mockResolvedValue([]);
    await renderScreen();
    expect(await screen.findByText(DEVICES_EMPTY_TITLE)).toBeOnTheScreen();
  });

  it('lỗi tải → EmptyState + Thử lại', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'));
    await renderScreen();

    expect(await screen.findByText('Không tải được danh sách thiết bị')).toBeOnTheScreen();

    mockedList.mockResolvedValue([OTHER_DEVICE]);
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(await screen.findByText('iPhone / iPad')).toBeOnTheScreen();
  });

  it('offline → ẩn nút Gỡ (không bấm rồi báo lỗi)', async () => {
    mockedConnection = 'offline';
    mockedList.mockResolvedValue([THIS_DEVICE, OTHER_DEVICE]);
    await renderScreen();

    await screen.findByText('Thiết bị này');
    expect(screen.queryByText('Gỡ')).toBeNull();
  });
});
