import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { type BiometricCapability } from '@/core/auth/biometric';
import { BiometricSettingRow } from '@/features/me/components/BiometricSettingRow';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useBiometricStore } from '@/shell/store/slices/biometric';

/**
 * `BiometricSettingRow` — bật/tắt THÀNH CÔNG, đi qua CHUỖI THẬT: bấm công tắc
 * → sheet mở → nhập mật khẩu → `enrollBiometric` → ghi kho khoá (mock
 * `expo-secure-store` toàn cục) → `binding` trong store đổi → công tắc tự cập
 * nhật (nó ĐỌC trực tiếp từ store, không có state lạc quan riêng).
 *
 * Hai ca hiển thị không chạm sheet (không cảm biến / `isUsable=false`) nằm ở
 * `BiometricSettingRow.test.tsx` — tách để mỗi file dưới trần 200 dòng.
 */

// Mock cứng — cờ bật/tắt phía BE (`auth.biometricLogin.enabled`) không phải
// điều đang test ở đây, và mock này chặn mọi request mạng thật rời khỏi test.
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));

const mockedGetCapability = jest.fn();
jest.mock('@/core/auth/biometric', () => {
  const actual = jest.requireActual('@/core/auth/biometric');
  return { ...actual, getBiometricCapability: () => mockedGetCapability() };
});

const mockedEnroll = jest.fn();
const mockedRevoke = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      enrollBiometric: (...args: unknown[]) => mockedEnroll(...args),
      revokeBiometricCredential: (...args: unknown[]) => mockedRevoke(...args),
    },
  };
});

const USABLE: BiometricCapability = {
  hasHardware: true,
  icon: 'lock',
  isUsable: true,
  kind: 'FINGERPRINT',
  label: 'vân tay',
};

/**
 * ⛔ `BiometricEnrollSheet` dựng trên `BottomSheet` dùng chung, và
 * `SheetSurface` bên trong nó gọi `useSafeAreaInsets()` — không có
 * `SafeAreaProvider` (kèm `initialMetrics`, vì Jest không có tầng native nào
 * đo được) thì hook đó NÉM LỖI ngay khi sheet mở ra.
 */
const SAFE_AREA_METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

/**
 * Đợi hết các microtask còn treo (lượt `await` cuối trong `finally` của
 * `useBiometricEnrollment.enable/disable`) TRƯỚC KHI test kết thúc và RNTL gỡ
 * component — thiếu bước này, `setIsEnabling(false)`/`setIsDisabling(false)`
 * chạy SAU khi đã unmount, React log cảnh báo "act()" và promise còn treo đó
 * có thể chỉ thực sự resolve giữa lúc TEST SAU đang render, gây nhiễu chéo.
 *
 * ⚠️ `setTimeout` THẬT (không phải chuỗi `Promise.resolve()` đếm tay): chuỗi
 * `enable()`/`disable()` đi qua NHIỀU lượt `await` lồng nhau, đếm tay dễ THIẾU
 * một vòng mà không báo lỗi gì.
 */
async function flushAsync(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function renderRow() {
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
  return render(<BiometricSettingRow />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.getState().setAuth({
    token: 'token',
    user: { email: 'nguoi-dung@vidu.com', id: 'user-1', name: 'Người dùng', permissions: [], roles: [] },
  });
  useBiometricStore.setState({ binding: null, hasHydrated: true });
});

/**
 * Gỡ SẠCH cây render của lượt test trước khi lượt SAU bắt đầu — thiếu bước
 * này, sheet còn "mở" (Modal) của một test trước có thể tiếp tục cập nhật
 * ngoài `act()` giữa lúc test sau đang render, sinh cảnh báo "overlapping
 * act() calls" và các phép `findByRole` sau đó tìm nhầm cây (hoặc không tìm
 * thấy gì) một cách khó đoán.
 */
afterEach(async () => {
  await flushAsync();
  cleanup();
});

describe('bật tính năng thành công', () => {
  it('bấm công tắc → nhập mật khẩu → xác nhận ⇒ công tắc chuyển ON', async () => {
    mockedGetCapability.mockResolvedValue(USABLE);
    mockedEnroll.mockResolvedValue({
      biometryKind: 'FINGERPRINT',
      credentialId: 'cred-moi',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      secret: 'bi-mat-thiet-bi-moi',
    });

    await renderRow();
    const toggle = await screen.findByRole('switch');
    expect(toggle.props.accessibilityState.checked).toBe(false);

    await fireEvent.press(toggle);
    const passwordInput = await screen.findByLabelText('Mật khẩu');
    await fireEvent.changeText(passwordInput, 'mat-khau-dung');

    const confirmButton = screen.getByText('Xác nhận');
    await fireEvent.press(confirmButton);

    await waitFor(() => expect(mockedEnroll).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useBiometricStore.getState().binding).not.toBeNull());

    const toggleAfter = await screen.findByRole('switch');
    await waitFor(() => expect(toggleAfter.props.accessibilityState.checked).toBe(true));

    await flushAsync();
  });
});

describe('tắt tính năng', () => {
  it('bấm công tắc (đang ON) ⇒ xoá binding trong store', async () => {
    mockedGetCapability.mockResolvedValue(USABLE);
    useBiometricStore.setState({
      binding: {
        credentialId: 'cred-cu',
        email: 'nguoi-dung@vidu.com',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        kind: 'FINGERPRINT',
        userId: 'user-1',
      },
      hasHydrated: true,
    });
    mockedRevoke.mockResolvedValue(undefined);

    await renderRow();
    const toggle = await screen.findByRole('switch');
    expect(toggle.props.accessibilityState.checked).toBe(true);

    await fireEvent.press(toggle);

    await waitFor(() => expect(useBiometricStore.getState().binding).toBeNull());
    await waitFor(() => expect(mockedRevoke).toHaveBeenCalledTimes(1));

    await flushAsync();
  });
});
