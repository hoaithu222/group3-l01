import { getAccessToken, purgeSession, setAccessToken } from '@/core/api/session';
import { connectSocket, disconnectSocket } from '@/core/socket';

import { applyRotatedAccessToken } from '../rotate-access-token';

/**
 * Đổi mật khẩu khiến BE ngắt MỌI socket của người dùng (kể cả máy vừa đổi) và cấp access token mới
 * cho phiên được giữ. Socket.IO không tự nối lại sau lệnh ngắt từ phía máy chủ.
 */

jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  connectSocket: jest.fn(),
  disconnectSocket: jest.fn(),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await purgeSession();
  setAccessToken('token-cu');
});

it('ghi token mới TRƯỚC, rồi ngắt và nối lại socket (lệnh ngắt của BE có thể tới sau phản hồi HTTP)', () => {
  applyRotatedAccessToken('token-moi');

  expect(getAccessToken()).toBe('token-moi');
  expect(disconnectSocket).toHaveBeenCalledTimes(1);
  expect(connectSocket).toHaveBeenCalledTimes(1);
  expect(jest.mocked(disconnectSocket).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(connectSocket).mock.invocationCallOrder[0] ?? -1,
  );
});
