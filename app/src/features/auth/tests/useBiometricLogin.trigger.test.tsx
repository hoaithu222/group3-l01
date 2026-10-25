import { AxiosError } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { saveSecret, type BiometricCapability } from '@/core/auth/biometric';
import { useBiometricLogin } from '@/features/auth/hooks/useBiometricLogin';
import { useBiometricStore } from '@/shell/store/slices/biometric';

/**
 * `useBiometricLogin` — luồng `trigger()`: thành công, huỷ quét, lỗi AUTH_014,
 * chặn chồng lượt. Điều kiện `available` nằm ở `useBiometricLogin.test.tsx` —
 * tách để mỗi file dưới trần 200 dòng.
 *
 * ⛔ Biến `secret` KHÔNG BAO GIỜ được gửi lên mạng — bài kiểm `not.toContain`
 * bên dưới là bằng chứng, không phải suy đoán từ đọc code.
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

const mockedCompleteSignIn = jest.fn();
jest.mock('@/shell/session/sign-in', () => ({
  completeSignIn: (...args: unknown[]) => mockedCompleteSignIn(...args),
}));

// Mock cứng — cờ bật/tắt phía BE không liên quan tới luồng `trigger()` đang
// test, và mock này chặn mọi request mạng thật rời khỏi test.
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
  useBiometricStore.setState({ binding: BINDING, hasHydrated: true });
  await saveSecret('bi-mat-thiet-bi', 'prompt');
});

describe('trigger — luồng thành công', () => {
  it('gửi ĐÚNG credentialId/deviceId/nonce/hmac, KHÔNG có secret, rồi completeSignIn', async () => {
    mockedFetchNonce.mockResolvedValue('nonce-abc');
    mockedBiometricLogin.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: null });

    const { result } = await renderHook(() => useBiometricLogin(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.capability).toBeDefined());

    await act(async () => {
      await result.current.trigger();
    });

    expect(mockedBiometricLogin).toHaveBeenCalledTimes(1);
    const payload = mockedBiometricLogin.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ credentialId: 'cred-1', nonce: 'nonce-abc' });
    expect(typeof payload.deviceId).toBe('string');
    expect(payload.hmac).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(payload)).not.toContain('bi-mat-thiet-bi');

    expect(mockedCompleteSignIn).toHaveBeenCalledWith(
      { accessToken: 'a', refreshToken: 'r', user: null },
      { method: 'BIOMETRIC' },
    );
  });
});

describe('trigger — huỷ quét', () => {
  it('BiometricError("cancelled") ⇒ im lặng, KHÔNG có errorMessage', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as { getItemAsync: jest.Mock };
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('UserCancel'));

    const { result } = await renderHook(() => useBiometricLogin(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.capability).toBeDefined());

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.errorMessage).toBeNull();
    expect(mockedBiometricLogin).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
  });
});

describe('trigger — AUTH_014 (credential đã bị thu hồi phía BE)', () => {
  it('gỡ gắn cục bộ (binding về null) và hiện đúng thông điệp', async () => {
    mockedFetchNonce.mockResolvedValue('nonce-abc');
    mockedBiometricLogin.mockRejectedValue(
      new AxiosError(
        'Request failed with status code 401',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        { status: 401, data: { errorCode: 'AUTH_014' } } as never,
      ),
    );
    mockedRevokeCredential.mockResolvedValue(undefined);

    const { result } = await renderHook(() => useBiometricLogin(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.capability).toBeDefined());

    await act(async () => {
      await result.current.trigger();
    });

    expect(useBiometricStore.getState().binding).toBeNull();
    expect(result.current.errorMessage).toBe(
      'Đăng nhập sinh trắc học trên thiết bị này đã bị vô hiệu. Vui lòng đăng nhập bằng mật khẩu rồi bật lại',
    );
    expect(mockedCompleteSignIn).not.toHaveBeenCalled();
  });
});

describe('trigger — chặn chồng lượt', () => {
  it('gọi trigger() hai lần gần như đồng thời ⇒ chỉ MỘT lượt biometricLogin thật sự chạy', async () => {
    mockedFetchNonce.mockResolvedValue('nonce-abc');
    mockedBiometricLogin.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: null });

    const { result } = await renderHook(() => useBiometricLogin(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.capability).toBeDefined());

    await act(async () => {
      const first = result.current.trigger();
      const second = result.current.trigger();
      await Promise.all([first, second]);
    });

    expect(mockedBiometricLogin).toHaveBeenCalledTimes(1);
  });
});
