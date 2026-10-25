import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getBiometricCapability, type BiometricCapability } from '@/core/auth/biometric';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useBiometricStore } from '@/shell/store/slices/biometric';

import { useBiometricEnrollment } from '../hooks/useBiometricEnrollment';

/**
 * ⛔ Bàn phím "Xong" hai lần liền khi lượt bật đầu chưa xong ⇒ HAI credential: cái đầu mồ côi
 * (ACTIVE phía BE mà máy không giữ bí mật của nó) và iOS hiện hai hộp quét. `isEnabling` (state) cập
 * nhật bất đồng bộ nên không đủ — cờ `ref` mới chặn được lượt thứ hai trong cùng khung hình.
 */

const mockedEnroll = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      enrollBiometric: (...a: unknown[]) => mockedEnroll(...a),
    },
  };
});
jest.mock('@/core/auth/biometric', () => ({
  ...jest.requireActual('@/core/auth/biometric'),
  getBiometricCapability: jest.fn(),
  saveSecret: jest.fn(),
}));

const USABLE: BiometricCapability = {
  hasHardware: true,
  icon: 'lock',
  isUsable: true,
  kind: 'FINGERPRINT',
  label: 'vân tay',
};

beforeEach(() => {
  jest.clearAllMocks();
  useBiometricStore.setState({ binding: null, hasHydrated: true });
  useAuthStore.getState().setAuth({
    token: 't',
    user: { email: 'a@vidu.com', id: 'u1', name: 'A', permissions: [], roles: [] },
  });
  jest.mocked(getBiometricCapability).mockResolvedValue(USABLE);
});

it('hai lượt enable liền nhau ⇒ MỘT lượt enroll; xong lượt đầu thì bật lại được', async () => {
  let finish!: (value: unknown) => void;
  mockedEnroll.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  const { result } = await renderHook(() => useBiometricEnrollment());

  let first!: Promise<{ ok: boolean }>;
  let second!: Promise<{ ok: boolean }>;
  await act(async () => {
    first = result.current.enable('mat-khau');
    second = result.current.enable('mat-khau');
    await Promise.resolve();
  });
  await expect(second).resolves.toEqual({ ok: false });
  await waitFor(() => expect(mockedEnroll).toHaveBeenCalledTimes(1));

  await act(async () => {
    finish({
      biometryKind: 'FINGERPRINT',
      credentialId: 'cred-1',
      expiresAt: '2027-01-01T00:00:00.000Z',
      secret: 's',
    });
    await first;
  });
  expect(mockedEnroll).toHaveBeenCalledTimes(1);
  expect(result.current.isEnabling).toBe(false);
});
