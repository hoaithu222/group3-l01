import { AxiosError } from 'axios';

import { apiClient } from '@/core/api/client';
import { getRefreshToken, purgeSession, setAccessToken, setRefreshToken } from '@/core/api/session';
import { useAuthStore } from '@/shell/store/slices/auth';

import { authService } from '../auth.service';
import { SESSION_NOT_READY_MESSAGE } from '../password.service';
import { createFakeAuthAdapter } from './fake-auth-adapter';

/**
 * Đổi mật khẩu — BE trả 401 cho cả "mật khẩu hiện tại sai" lẫn "token hết hạn". Để interceptor
 * tự xử thì gõ sai mật khẩu là làm mới → phát lại → 401 → DỌN PHIÊN (đá người dùng ra ngoài).
 */
const fake = createFakeAuthAdapter();
const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

function jwtExpiringIn(seconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }));
  return `h.${payload}.s`;
}

beforeAll(() => {
  apiClient.defaults.adapter = fake.adapter;
});

beforeEach(async () => {
  fake.reset();
  mockFetch.mockReset();
  await purgeSession();
  await setRefreshToken('refresh-1');
  setAccessToken(jwtExpiringIn(600));
});

const PAYLOAD = { currentPassword: 'Cu-1234', newPassword: 'Moi-12345' };

it('PATCH /auth/change-password đúng payload', async () => {
  await authService.changePassword(PAYLOAD);

  const call = fake.calls.find((c) => c.url === '/auth/change-password');
  expect(call?.method).toBe('patch');
  expect(call?.data).toEqual(PAYLOAD);
});

it('sai mật khẩu hiện tại (401 AUTH_002) ⇒ lỗi nổi lên form, KHÔNG làm mới token, KHÔNG dọn phiên', async () => {
  fake.responders.set('/auth/change-password', () => ({
    data: { error: { code: 'AUTH_002', message: 'Mật khẩu hiện tại không đúng' } },
    status: 401,
  }));

  await expect(authService.changePassword(PAYLOAD)).rejects.toBeInstanceOf(AxiosError);

  expect(mockFetch).not.toHaveBeenCalled();
  expect(fake.countCallsTo('/auth/change-password')).toBe(1);
  expect(useAuthStore.getState().token).not.toBeNull();
  expect(await getRefreshToken()).toBe('refresh-1');
});

it('access token hết hạn ⇒ làm mới TRƯỚC rồi mới gửi (401 sau đó chắc chắn là sai mật khẩu)', async () => {
  setAccessToken(jwtExpiringIn(-30));
  mockFetch.mockResolvedValue({
    json: async () => ({ accessToken: jwtExpiringIn(900) }),
    ok: true,
    status: 200,
  } as Response);

  await authService.changePassword(PAYLOAD);

  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(fake.countCallsTo('/auth/change-password')).toBe(1);
});

it('không làm mới được (mất sóng) ⇒ KHÔNG gửi lên máy chủ, ném câu lỗi dễ hiểu', async () => {
  setAccessToken(jwtExpiringIn(-30));
  mockFetch.mockRejectedValue(new Error('Network request failed'));

  await expect(authService.changePassword(PAYLOAD)).rejects.toThrow(SESSION_NOT_READY_MESSAGE);

  expect(fake.countCallsTo('/auth/change-password')).toBe(0);
});

it('trả số phiên khác đã bị đăng xuất VÀ access token mới khi BE giữ được phiên này', async () => {
  fake.responders.set('/auth/change-password', () => ({
    data: { data: { revokedSessions: 2, accessToken: 'token-moi', tokenType: 'Bearer' } },
    status: 200,
  }));

  await expect(authService.changePassword(PAYLOAD)).resolves.toEqual({
    accessToken: 'token-moi',
    revokedSessions: 2,
  });
});

it('BE không trả access token (đã thu hồi TẤT CẢ phiên) ⇒ kết quả KHÔNG có accessToken', async () => {
  fake.responders.set('/auth/change-password', () => ({
    data: { data: { revokedSessions: 3 } },
    status: 200,
  }));

  const result = await authService.changePassword(PAYLOAD);

  expect(result).toEqual({ revokedSessions: 3 });
  expect(result).not.toHaveProperty('accessToken');
});

it('phản hồi thiếu thân (body rỗng) ⇒ revokedSessions về 0, không ném lỗi', async () => {
  fake.responders.set('/auth/change-password', () => ({ data: null, status: 200 }));

  await expect(authService.changePassword(PAYLOAD)).resolves.toEqual({ revokedSessions: 0 });
});
