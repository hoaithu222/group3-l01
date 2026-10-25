import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { saveSecret, type BiometricCapability } from '@/core/auth/biometric';
import { useBiometricLogin } from '@/features/auth/hooks/useBiometricLogin';
import { useBiometricStore } from '@/shell/store/slices/biometric';

/**
 * `useBiometricLogin` — điều kiện `available` (`app.md` §4). Luồng `trigger()`
 * (thành công/huỷ/lỗi/chặn chồng) nằm ở `useBiometricLogin.trigger.test.tsx` —
 * tách để mỗi file dưới trần 200 dòng (`docs/rules/code-style.md`).
 *
 * ── Chiến lược mock ───────────────────────────────────────────────────────────
 * `readSecret`/`computeBiometricHmac`/kho khoá là THẬT (chạy qua bản mock
 * `expo-secure-store` toàn cục ở `jest.setup.js`) — chỉ mock TẦNG MẠNG
 * (`authService`) và `getBiometricCapability` (để điều khiển `isUsable` trong
 * test mà không cần mô phỏng `expo-local-authentication` chi tiết).
 */

const mockedFetchNonce = jest.fn();
const mockedBiometricLogin = jest.fn();
const mockedRevokeCredential = jest.fn();

jest.mock('@/core/api/auth', () => ({
  authService: {
    fetchNonce: (...args: unknown[]) => mockedFetchNonce(...args),
    biometricLogin: (...args: unknown[]) => mockedBiometricLogin(...args),
    revokeBiometricCredential: (...args: unknown[]) => mockedRevokeCredential(...args),
  },
}));

jest.mock('@/shell/session/sign-in', () => ({ completeSignIn: jest.fn() }));

// `useCapabilities()` (cờ bật/tắt phía BE) không liên quan tới điều kiện
// `available` mà bộ test này đang chốt — mock cứng để không có request mạng
// thật nào rời khỏi test (BE `auth.biometricLogin.enabled` mặc định `true`
// lúc chưa tải xong, xem chú thích ở `useBiometricLogin.ts`).
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));

const mockedGetCapability = jest.fn();
jest.mock('@/core/auth/biometric', () => {
  const actual = jest.requireActual('@/core/auth/biometric');
  return { ...actual, getBiometricCapability: () => mockedGetCapability() };
});

const USABLE_CAPABILITY: BiometricCapability = {
  hasHardware: true,
  isUsable: true,
  kind: 'FINGERPRINT',
  label: 'vân tay',
  icon: 'lock',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const BINDING = {
  credentialId: 'cred-1',
  email: 'a@b.com',
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  kind: 'FINGERPRINT' as const,
  userId: 'user-1',
};

beforeEach(async () => {
  jest.clearAllMocks();
  mockedGetCapability.mockResolvedValue(USABLE_CAPABILITY);
  useBiometricStore.setState({ binding: null, hasHydrated: true });
  await saveSecret('bi-mat-thiet-bi', 'prompt');
});

describe('available', () => {
  it('false khi chưa gắn kết, dù capability dùng được', async () => {
    const { result } = await renderHook(() => useBiometricLogin(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.capability).toBeDefined());

    expect(result.current.available).toBe(false);
  });

  it('true khi đã gắn kết + dùng được + email đang gõ TRỐNG', async () => {
    useBiometricStore.setState({ binding: BINDING, hasHydrated: true });

    const { result } = await renderHook(() => useBiometricLogin(''), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.available).toBe(true));
  });

  it('true khi email đang gõ TRÙNG email đã gắn (không phân biệt hoa/thường)', async () => {
    useBiometricStore.setState({ binding: BINDING, hasHydrated: true });

    const { result } = await renderHook(() => useBiometricLogin('A@B.COM'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.available).toBe(true));
  });

  it('false khi email đang gõ KHÁC email đã gắn', async () => {
    useBiometricStore.setState({ binding: BINDING, hasHydrated: true });

    const { result } = await renderHook(() => useBiometricLogin('khac@b.com'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.capability).toBeDefined());

    expect(result.current.available).toBe(false);
  });

  it('false khi capability.isUsable = false dù đã gắn kết', async () => {
    mockedGetCapability.mockResolvedValue({ ...USABLE_CAPABILITY, isUsable: false });
    useBiometricStore.setState({ binding: BINDING, hasHydrated: true });

    const { result } = await renderHook(() => useBiometricLogin(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.capability).toBeDefined());

    expect(result.current.available).toBe(false);
  });
});
