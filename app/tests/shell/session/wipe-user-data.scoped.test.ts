import AsyncStorage from '@react-native-async-storage/async-storage';

import { queryClient } from '@/core/config/query-client';
import { readScoped, writeScoped } from '@/core/storage/session-scoped-storage';
import { wipeUserData } from '@/shell/session/wipe-user-data';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * SHL-01 — đăng nhập A → dùng → rời phiên → đăng nhập B cùng máy: không còn dữ liệu query/khoá AsyncStorage của A, còn
 * khoá của B và khoá của máy. Danh sách store zustand được kiểm ở `wipe-user-data.steps.test.ts` — ở đây `WIPE_STEPS`
 * được thay bằng MỘT bước giả để test nhẹ và chỉ nhìn vào phần khoá theo người dùng + cache truy vấn.
 */

const mockStep = jest.fn();
jest.mock('@/shell/session/wipe-steps', () => ({
  WIPE_STEPS: { gia: (...args: unknown[]) => mockStep(...args) },
}));

const A = 'a1b2c3d4e5f60718293a4b5c';
const B = 'b1b2c3d4e5f60718293a4b5c';

beforeEach(async () => {
  mockStep.mockClear();
  queryClient.clear();
  useAuthStore.getState().clearAuth();
  await AsyncStorage.clear();

  queryClient.setQueryData(['conversations', 'list'], [{ id: 'c1' }]);
  await writeScoped(A, 'draft:c1', 'nháp của A');
  await writeScoped(A, 'filters', { unread: true });
  await writeScoped(B, 'draft:c1', 'nháp của B');
  await AsyncStorage.setItem('theme', '"dark"');
});

describe('wipeUserData(userId)', () => {
  it('xoá cache truy vấn + MỌI khoá u:A:*; khoá của B và khoá của máy còn nguyên', async () => {
    await wipeUserData(A);

    expect(queryClient.getQueryData(['conversations', 'list'])).toBeUndefined();
    await expect(readScoped(A, 'draft:c1')).resolves.toBeNull();
    await expect(readScoped(A, 'filters')).resolves.toBeNull();
    await expect(readScoped(B, 'draft:c1')).resolves.toBe('nháp của B');
    await expect(AsyncStorage.getItem('theme')).resolves.toBe('"dark"');
    expect(mockStep).toHaveBeenCalledTimes(1);
  });

  it('không truyền userId ⇒ lấy người đang có trong auth store (đường useLogout)', async () => {
    useAuthStore.setState({ user: { id: B } as never });

    await wipeUserData();

    await expect(readScoped(B, 'draft:c1')).resolves.toBeNull();
    await expect(readScoped(A, 'draft:c1')).resolves.toBe('nháp của A');
  });

  it('userId = null (chưa từng biết hồ sơ) ⇒ vẫn dọn cache, KHÔNG xoá khoá theo người dùng nào', async () => {
    await wipeUserData(null);

    expect(queryClient.getQueryData(['conversations', 'list'])).toBeUndefined();
    await expect(readScoped(A, 'draft:c1')).resolves.toBe('nháp của A');
    await expect(readScoped(B, 'draft:c1')).resolves.toBe('nháp của B');
  });

  it('idempotent: chạy hai lần liền không lỗi', async () => {
    await wipeUserData(A);

    await expect(wipeUserData(A)).resolves.toBeUndefined();
  });
});
