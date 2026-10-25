import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { type BiometricCapability } from '@/core/auth/biometric';
import { BiometricSettingRow } from '@/features/me/components/BiometricSettingRow';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useBiometricStore } from '@/shell/store/slices/biometric';

/**
 * `BiometricSettingRow` — hai ca hiển thị KHÔNG chạm sheet: máy không cảm
 * biến (không render gì) và máy có cảm biến nhưng không dùng được (hiện hàng,
 * bấm ra toast hướng dẫn). Ca "bật/tắt thành công" (đi qua sheet, kho khoá,
 * mạng) nằm ở `BiometricSettingRow.toggle.test.tsx` — tách để mỗi file dưới
 * trần 200 dòng (`docs/rules/code-style.md`).
 */

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
const mockedToast = jest.mocked(showToast);

// Mock cứng — cờ bật/tắt phía BE (`auth.biometricLogin.enabled`) không phải
// điều đang test ở đây, và mock này chặn mọi request mạng thật rời khỏi test.
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));

const mockedGetCapability = jest.fn();
jest.mock('@/core/auth/biometric', () => {
  const actual = jest.requireActual('@/core/auth/biometric');
  return { ...actual, getBiometricCapability: () => mockedGetCapability() };
});

const USABLE: BiometricCapability = {
  hasHardware: true,
  icon: 'lock',
  isUsable: true,
  kind: 'FINGERPRINT',
  label: 'vân tay',
};

function renderRow() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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

describe('máy KHÔNG có cảm biến', () => {
  it('không render gì cả', async () => {
    mockedGetCapability.mockResolvedValue({
      hasHardware: false,
      icon: 'lock',
      isUsable: false,
      kind: null,
      label: 'sinh trắc học',
    } satisfies BiometricCapability);

    await renderRow();
    await waitFor(() => expect(mockedGetCapability).toHaveBeenCalled());

    // ⚠️ KHÔNG so `view.toJSON()` với `null` — `render(..., { wrapper })` gói
    // component trong `QueryClientProvider`, nên cây kết quả LUÔN có node của
    // provider đó dù `BiometricSettingRow` tự nó trả `null`. Kiểm đúng thứ cần
    // kiểm: không có công tắc, không có nhãn hàng.
    await waitFor(() => expect(screen.queryByRole('switch')).toBeNull());
    expect(screen.queryByText(/Đăng nhập bằng/)).toBeNull();
  });
});

describe('có cảm biến nhưng isUsable=false', () => {
  it('hàng vẫn hiện, bấm công tắc ⇒ toast hướng dẫn, KHÔNG mở sheet', async () => {
    mockedGetCapability.mockResolvedValue({ ...USABLE, isUsable: false });

    await renderRow();
    const toggle = await screen.findByRole('switch');

    await fireEvent.press(toggle);

    expect(mockedToast).toHaveBeenCalledWith(
      'error',
      'Vui lòng bật vân tay trong Cài đặt máy để sử dụng tính năng này.',
    );
    expect(screen.queryByText('Mật khẩu')).toBeNull();
  });
});
