import { apiClient } from '@/core/api/client';
import { getRefreshToken, purgeSession, setAccessToken, setRefreshToken } from '@/core/api/session';
import { useAuthStore } from '@/shell/store/slices/auth';

import { authService } from '../auth.service';
import { createFakeAuthAdapter } from './fake-auth-adapter';

/**
 * Đăng xuất phải THU HỒI phiên phía máy chủ — không chỉ xoá token trên máy.
 *
 * ⛔ Lỗi đã có thật: app gọi `POST /auth/logout` không kèm gì, mà BE chỉ đọc refresh token
 * từ cookie (web) hoặc `body.refreshToken` (app). App không có cookie ⇒ phiên trên máy chủ
 * không bao giờ bị thu hồi; refresh token bị đánh cắp dùng được tiếp 7 ngày.
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

it('gửi refreshToken trong body rồi dọn phiên', async () => {
  await authService.logout();

  const logoutCall = fake.calls.find((call) => call.url === '/auth/logout');
  expect(logoutCall?.method).toBe('post');
  expect(logoutCall?.data).toEqual({ refreshToken: 'refresh-1' });
  expect(useAuthStore.getState().token).toBeNull();
  expect(await getRefreshToken()).toBeNull();
});

it('đặt trần thời gian ngắn — mất sóng không được giữ người dùng nửa phút', async () => {
  await authService.logout();

  const timeout = fake.calls.find((call) => call.url === '/auth/logout')?.timeout;
  expect(timeout).toBeDefined();
  expect(timeout).toBeLessThanOrEqual(5000);
});

it('access token hết hạn ⇒ KHÔNG làm mới; gửi refresh token hiện có (BE logout chỉ cần refresh token)', async () => {
  setAccessToken(jwtExpiringIn(-30));

  await authService.logout();

  // Không xoay vòng token chỉ để thu hồi nó — và không tốn thêm một vòng mạng khi sắp đưa máy cho người khác.
  expect(mockFetch).not.toHaveBeenCalled();
  expect(fake.calls.find((call) => call.url === '/auth/logout')?.data).toEqual({
    refreshToken: 'refresh-1',
  });
});

it('máy chủ lỗi ⇒ vẫn dọn phiên, không ném', async () => {
  fake.responders.set('/auth/logout', () => ({ data: {}, status: 500 }));

  await expect(authService.logout()).resolves.toBeUndefined();

  expect(useAuthStore.getState().token).toBeNull();
  expect(await getRefreshToken()).toBeNull();
});

it('access token hết hạn và mất sóng ⇒ lượt gọi máy chủ hỏng nhưng vẫn dọn phiên', async () => {
  setAccessToken(jwtExpiringIn(-30));
  fake.responders.set('/auth/logout', () => {
    throw new Error('Network request failed');
  });

  await expect(authService.logout()).resolves.toBeUndefined();

  expect(fake.countCallsTo('/auth/logout')).toBe(1);
  expect(useAuthStore.getState().token).toBeNull();
  expect(await getRefreshToken()).toBeNull();
});
