import { AxiosError, type AxiosResponse } from 'axios';

import {
  getBiometricCapability,
  saveSecret,
  type BiometricCapability,
} from '@/core/auth/biometric';
import { useBiometricStore } from '@/shell/store/slices/biometric';

import { performBiometricEnroll } from '../hooks/perform-biometric-enroll';

/**
 * Chuỗi BẬT đăng nhập sinh trắc học: mật khẩu chỉ đi tới BE (không lưu đâu cả), bí mật thiết bị do
 * BE cấp mới vào kho khoá, và mọi lỗi hiện thành câu tiếng Việt — ⛔ không bao giờ là thông điệp
 * thô của hệ điều hành ("User canceled the authentication").
 */

const mockedEnroll = jest.fn();
const mockedRevoke = jest.fn();
jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      enrollBiometric: (...a: unknown[]) => mockedEnroll(...a),
      revokeBiometricCredential: (...a: unknown[]) => mockedRevoke(...a),
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
const USER = { email: 'a@vidu.com', id: 'u1', name: 'A', permissions: [], roles: [] };
const ENROLLED = {
  biometryKind: 'FINGERPRINT',
  credentialId: 'cred-1',
  expiresAt: '2027-01-01T00:00:00.000Z',
  secret: 'bi-mat-thiet-bi',
};

function httpError(status: number, code: string): AxiosError {
  const response = { data: { error: { code, message: 'x' } }, status } as unknown as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

beforeEach(() => {
  jest.clearAllMocks();
  useBiometricStore.setState({ binding: null, hasHydrated: true });
  jest.mocked(getBiometricCapability).mockResolvedValue(USABLE);
  mockedEnroll.mockResolvedValue(ENROLLED);
  mockedRevoke.mockResolvedValue(undefined);
});

it('thành công: gửi mật khẩu cho BE, cất BÍ MẬT THIẾT BỊ (không phải mật khẩu), binding không chứa bí mật', async () => {
  await expect(performBiometricEnroll(USER, 'mat-khau-that')).resolves.toEqual({ ok: true });

  expect(mockedEnroll).toHaveBeenCalledWith(expect.objectContaining({ password: 'mat-khau-that' }));
  expect(saveSecret).toHaveBeenCalledWith('bi-mat-thiet-bi', expect.any(String));
  expect(JSON.stringify(jest.mocked(saveSecret).mock.calls)).not.toContain('mat-khau-that');
  const binding = useBiometricStore.getState().binding;
  expect(Object.keys(binding ?? {}).sort()).toEqual(
    ['credentialId', 'email', 'expiresAt', 'kind', 'userId'].sort(),
  );
  expect(JSON.stringify(binding)).not.toMatch(/mat-khau|bi-mat/);
});

it('sai mật khẩu (401 AUTH_001) ⇒ "Mật khẩu không đúng.", chưa có credential nào để dọn', async () => {
  mockedEnroll.mockRejectedValue(httpError(401, 'AUTH_001'));

  await expect(performBiometricEnroll(USER, 'sai')).resolves.toEqual({
    kind: 'message',
    message: 'Mật khẩu không đúng.',
    ok: false,
  });
  expect(saveSecret).not.toHaveBeenCalled();
  expect(mockedRevoke).not.toHaveBeenCalled();
});

it('mất mạng ⇒ kind "network" (toast riêng, không phải lỗi ở ô mật khẩu)', async () => {
  mockedEnroll.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));

  await expect(performBiometricEnroll(USER, 'x')).resolves.toEqual({ kind: 'network', ok: false });
});

it.each([
  ['người dùng huỷ hộp quét', new Error('User canceled the authentication'), /Đã huỷ xác thực/],
  ['kho khoá lỗi lạ', new Error('Could not encrypt the item in SecureStore'), /Chưa bật được/],
])(
  '%s lúc ghi kho khoá ⇒ câu tiếng Việt (KHÔNG lộ thông điệp thô), và DỌN credential vừa tạo',
  async (_n, failure, message) => {
    jest.mocked(saveSecret).mockRejectedValue(failure);

    const outcome = await performBiometricEnroll(USER, 'mat-khau-that');

    expect(outcome.ok).toBe(false);
    expect(outcome).toEqual({
      kind: 'message',
      message: expect.stringMatching(message),
      ok: false,
    });
    expect(JSON.stringify(outcome)).not.toMatch(/canceled|encrypt|SecureStore/i);
    expect(mockedRevoke).toHaveBeenCalledWith('cred-1');
    expect(useBiometricStore.getState().binding).toBeNull();
  },
);

it('máy không dùng được sinh trắc học ⇒ hướng dẫn, KHÔNG gọi BE', async () => {
  jest.mocked(getBiometricCapability).mockResolvedValue({ ...USABLE, isUsable: false });

  const outcome = await performBiometricEnroll(USER, 'x');

  expect(outcome).toMatchObject({ kind: 'message', ok: false });
  expect(mockedEnroll).not.toHaveBeenCalled();
});
