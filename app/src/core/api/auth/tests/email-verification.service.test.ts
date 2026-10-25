import { apiClient } from '@/core/api/client';

import { AUTH_ENDPOINTS } from '../auth.api';
import { authService } from '../auth.service';

/**
 * Xác minh email bằng mã 6 số (BE `POST /auth/verify-email/{send,confirm}`): đúng đường dẫn/thân yêu cầu, và `skipErrorToast` để lỗi (mã sai, gửi quá 3 lần/15 phút)
 * hiện TRONG ô nhập mã thay vì toast tự tắt sau 4 giây.
 */
jest.mock('@/core/api/client', () => ({ apiClient: { post: jest.fn() } }));

const post = jest.mocked(apiClient.post);

beforeEach(() => {
  jest.clearAllMocks();
  post.mockResolvedValue({ data: { success: true, data: null } });
});

it('gửi mã: POST /auth/verify-email/send, không thân, skipErrorToast', async () => {
  await authService.sendEmailVerification();

  expect(AUTH_ENDPOINTS.VERIFY_EMAIL_SEND).toBe('/auth/verify-email/send');
  expect(post).toHaveBeenCalledWith('/auth/verify-email/send', undefined, { skipErrorToast: true });
});

it('xác nhận: POST /auth/verify-email/confirm { code } (6 số, BE `confirmEmailSchema`), skipErrorToast', async () => {
  await authService.confirmEmailVerification('123456');

  expect(AUTH_ENDPOINTS.VERIFY_EMAIL_CONFIRM).toBe('/auth/verify-email/confirm');
  expect(post).toHaveBeenCalledWith(
    '/auth/verify-email/confirm',
    { code: '123456' },
    { skipErrorToast: true },
  );
});

it('lỗi từ BE được ném nguyên cho nơi gọi tự phân loại (không nuốt)', async () => {
  const failure = new Error('HTTP 400');
  post.mockRejectedValueOnce(failure);

  await expect(authService.confirmEmailVerification('000000')).rejects.toBe(failure);
});
