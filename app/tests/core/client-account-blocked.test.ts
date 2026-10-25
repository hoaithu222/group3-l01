import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';

import { apiClient } from '@/core/api/client';
import { getRefreshToken, purgeSession, setAccessToken, setRefreshToken } from '@/core/api/session';
import { __resetSessionEndListenersForTests, onSessionEnded } from '@/core/api/session-end';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * 403 `AUTH_011` (khoá) / `AUTH_012` (chờ xoá) trên request CÓ PHIÊN ⇒ phiên chết thật.
 *
 * ⛔ Lỗi đã có thật: `authenticateToken` của BE kiểm TRẠNG THÁI TÀI KHOẢN trước `sessionVersion`, nên
 * người dùng vừa yêu cầu xoá tài khoản ở máy khác (BE thu hồi mọi phiên) nhận 403 chứ không 401 —
 * luồng làm mới không bao giờ chạy, app ngồi yên "đã đăng nhập" với token chết, mọi request kế tiếp
 * cùng toast lỗi, và socket (BE đã ngắt, socket.io không tự nối lại) im lặng.
 */

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

let status = 403;
let errorBody: unknown = {};

const adapter: AxiosAdapter = (config) => {
  const response = {
    config,
    data: errorBody,
    headers: {},
    request: {},
    status,
    statusText: '',
  } as unknown as AxiosResponse;
  return Promise.reject(
    new AxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_REQUEST',
      config,
      {},
      response,
    ),
  );
};

const ended = jest.fn();

beforeAll(() => {
  apiClient.defaults.adapter = adapter;
});

beforeEach(async () => {
  jest.clearAllMocks();
  __resetSessionEndListenersForTests();
  await purgeSession();
  status = 403;
  errorBody = {};
  await setRefreshToken('refresh-cu');
  setAccessToken('access-cu');
  onSessionEnded(ended);
});

it.each([
  ['AUTH_012', 'Tài khoản đang chờ xoá'],
  ['AUTH_011', 'Tài khoản đã bị khoá'],
])('403 %s trên request có phiên ⇒ dọn phiên, báo người dùng đúng lý do', async (code, message) => {
  errorBody = { error: { code, message: 'x' } };

  await expect(apiClient.get('/conversations')).rejects.toBeInstanceOf(AxiosError);

  expect(useAuthStore.getState().token).toBeNull();
  expect(await getRefreshToken()).toBeNull();
  expect(ended).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledWith('error', message);
});

it('nhiều request cùng ăn 403 ⇒ MỘT đợt dọn (không dọn chồng)', async () => {
  errorBody = { error: { code: 'AUTH_012', message: 'x' } };

  await Promise.allSettled([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);

  expect(ended).toHaveBeenCalledTimes(1);
});

it('lượt đăng nhập (skipAuthRefresh) nhận AUTH_012 là chuyện HỢP LỆ ⇒ KHÔNG dọn gì', async () => {
  errorBody = { error: { code: 'AUTH_012', message: 'x' } };

  await expect(
    apiClient.post('/auth/login', {}, { skipAuthRefresh: true, skipErrorToast: true }),
  ).rejects.toBeInstanceOf(AxiosError);

  expect(useAuthStore.getState().token).toBe('access-cu');
  expect(await getRefreshToken()).toBe('refresh-cu');
  expect(ended).not.toHaveBeenCalled();
});

it('403 vì THIẾU QUYỀN (mã khác) ⇒ giữ phiên', async () => {
  errorBody = { error: { code: 'PERM_001', message: 'x' } };

  await expect(apiClient.get('/admin/users', { skipErrorToast: true })).rejects.toBeInstanceOf(
    AxiosError,
  );

  expect(useAuthStore.getState().token).toBe('access-cu');
  expect(ended).not.toHaveBeenCalled();
});
