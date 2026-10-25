import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { SessionSummary } from '@/core/api/auth';
import { SESSION_REVOKE_DIALOG_TITLE } from '@/features/me/constants/session.messages';
import { SessionsScreen } from '@/features/me/screens/SessionsScreen';
import { showToast } from '@/shared/utils/toast.utils';

/**
 * `SessionsScreen` — ba hành vi cốt lõi của p0-01 mục 10 ("Phiên đăng nhập"):
 * hiện danh sách, ẩn nút "Thu hồi" ở phiên `isCurrent`, và bấm Thu hồi phải đi
 * qua hộp thoại xác nhận trước khi gọi API thật.
 *
 * ⛔ KHÔNG bấm nút "Quay lại" của `AppBar` ở đây: nó gọi thẳng `router.back`
 * của `expo-router` THẬT (không mock), và không có Stack nào đứng sau để nhận
 * cú back trong môi trường test.
 */

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
const mockedToast = jest.mocked(showToast);

const mockedListSessions = jest.fn();
const mockedRevokeSession = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      listSessions: (...args: unknown[]) => mockedListSessions(...args),
      revokeSession: (...args: unknown[]) => mockedRevokeSession(...args),
    },
  };
});

const CURRENT_SESSION: SessionSummary = {
  authMethod: 'PASSWORD',
  createdAt: '2026-09-10T00:00:00.000Z',
  deviceId: 'device-1',
  id: 'session-current',
  ipAddress: '192.168.1.10',
  isCurrent: true,
  lastUsedAt: '2026-09-16T08:00:00.000Z',
  userAgent: 'Mozilla/5.0 (Linux; Android 14)',
};

const OTHER_SESSION: SessionSummary = {
  authMethod: 'BIOMETRIC',
  createdAt: '2026-09-01T00:00:00.000Z',
  deviceId: 'device-2',
  id: 'session-other',
  ipAddress: '10.0.0.5',
  isCurrent: false,
  lastUsedAt: '2026-09-15T08:00:00.000Z',
  userAgent: null,
};

/** ⚠️ `Screen`/`AppBar` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`, nếu không `screen` (singleton) chưa kịp gắn vào lần render này. */
async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  return render(<SessionsScreen />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('hiện danh sách phiên, và ẩn nút "Thu hồi" ở đúng phiên isCurrent', async () => {
  mockedListSessions.mockResolvedValue([CURRENT_SESSION, OTHER_SESSION]);

  await renderScreen();

  await screen.findByText('Thiết bị này');
  // Chỉ MỘT nút "Thu hồi" — của `OTHER_SESSION`. `CURRENT_SESSION` không có nút
  // này dù BE có tự chặn `DELETE` lên chính nó hay không.
  expect(screen.getAllByText('Thu hồi')).toHaveLength(1);
  // IP hiện RÚT GỌN (p0-01 mục 3) — trước đây hiện đủ `10.0.0.5`; hai đoạn cuối không lên màn hình.
  expect(screen.getByText(/10\.0\.\*\.\*/)).toBeOnTheScreen();
  expect(screen.queryByText(/10\.0\.0\.5/)).toBeNull();
});

it('bấm "Thu hồi" → xác nhận ⇒ gọi revokeSession đúng id, đóng hộp thoại, toast thành công', async () => {
  mockedListSessions.mockResolvedValue([CURRENT_SESSION, OTHER_SESSION]);
  mockedRevokeSession.mockResolvedValue(undefined);

  await renderScreen();

  const revokeButton = await screen.findByText('Thu hồi');
  await fireEvent.press(revokeButton);

  await screen.findByText(SESSION_REVOKE_DIALOG_TITLE);
  // ⛔ Bấm "Thu hồi" KHÔNG được gọi API ngay — phải qua nút xác nhận riêng
  // trong hộp thoại, tên khác để trình đọc màn hình không lẫn hai nút.
  expect(mockedRevokeSession).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText('Xác nhận'));

  await waitFor(() => expect(mockedRevokeSession).toHaveBeenCalledWith('session-other'));
  await waitFor(() =>
    expect(mockedToast).toHaveBeenCalledWith('success', 'Đã thu hồi phiên đăng nhập.'),
  );
  await waitFor(() => expect(screen.queryByText(SESSION_REVOKE_DIALOG_TITLE)).toBeNull());
});
