import { renderHook } from '@testing-library/react-native';
import { act } from 'react';

import { wipeLocalPushState } from '@/core/notifications';
import { useAuthStore } from '@/shell/store/slices/auth';

import { clearPrimerRecord } from '../push-primer';
import { usePushSessionCleanup } from '../usePushSessionCleanup';

/**
 * `app.md` §5 "Logout": rời phiên đăng nhập → xoá khay thông báo + huy hiệu + trạng thái primer của người vừa rời.
 * Chạy cho cả phiên chết do 401 (`purgeSession`), không chỉ nút "Đăng xuất".
 */

jest.mock('@/core/notifications', () => ({ wipeLocalPushState: jest.fn(async () => undefined) }));
jest.mock('../push-primer', () => ({ clearPrimerRecord: jest.fn(async () => undefined) }));

const mockedWipe = jest.mocked(wipeLocalPushState);
const mockedClearPrimer = jest.mocked(clearPrimerRecord);

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated', token: 'jwt', user: { id: 'u-1' } as never });
});

afterAll(() => {
  useAuthStore.setState({ status: 'anonymous', token: null, user: null });
});

describe('usePushSessionCleanup', () => {
  it('authenticated → anonymous: dọn khay + xoá primer của ĐÚNG người vừa rời', async () => {
    await renderHook(() => usePushSessionCleanup());

    await act(async () => useAuthStore.getState().clearAuth());

    expect(mockedWipe).toHaveBeenCalledTimes(1);
    expect(mockedClearPrimer).toHaveBeenCalledWith('u-1');
  });

  it('token refresh (vẫn authenticated) → KHÔNG dọn', async () => {
    await renderHook(() => usePushSessionCleanup());

    await act(async () => useAuthStore.getState().setAuth({ token: 'jwt-2' }));

    expect(mockedWipe).not.toHaveBeenCalled();
  });

  it('khởi động (chưa từng đăng nhập) idle → anonymous: KHÔNG dọn khay', async () => {
    useAuthStore.setState({ status: 'idle', token: null, user: null });
    await renderHook(() => usePushSessionCleanup());

    await act(async () => useAuthStore.getState().setStatus('anonymous'));

    expect(mockedWipe).not.toHaveBeenCalled();
    expect(mockedClearPrimer).not.toHaveBeenCalled();
  });

  it('gỡ hook → không còn nghe', async () => {
    const view = await renderHook(() => usePushSessionCleanup());
    await view.unmount();

    await act(async () => useAuthStore.getState().clearAuth());
    expect(mockedWipe).not.toHaveBeenCalled();
  });
});
