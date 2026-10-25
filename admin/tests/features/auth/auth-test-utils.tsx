/**
 * Đồ dùng chung cho các bài kiểm luồng xác thực ở tầng trang/guard: dựng router THẬT của app
 * (guard + layout + lazy-load + shell) trong jsdom, "BE giả" bằng MSW.
 *
 * Mỗi file test PHẢI khai (vi.mock được nâng lên đầu file nên không đặt được ở đây):
 *
 *   vi.mock('socket.io-client', async () => {
 *     const { fakeSocket } = await import('../moderation/fake-socket');
 *     return { io: vi.fn(() => fakeSocket) };
 *   });
 */
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router-dom';

import { AppProvider } from '@/app/providers';
import { routes } from '@/app/router';
import { useAuthStore, type AuthUser } from '@/app/store';
import { queryClient } from '@/core/config';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

/** Người vận hành: vai `manager`, có quyền xem người dùng. */
export const OPS_USER: AuthUser = {
  id: 'u1',
  email: 'an@congty.vn',
  name: 'Nguyễn Văn An',
  roles: ['manager'],
  permissions: ['user:view'],
};

/** Tài khoản `user` thường — BE cấp ZERO quyền quản trị cho vai này. */
export const PLAIN_USER: AuthUser = {
  id: 'u9',
  email: 'khach@congty.vn',
  name: 'Khách Hàng',
  roles: ['user'],
  permissions: [],
};

export const errorBody = (code: string, message = 'lỗi máy chủ') => ({
  success: false,
  error: { code, message },
  requestId: 'req-1',
});

export const sessionBody = (user: AuthUser, token = 'token-moi') => ({
  success: true,
  data: { accessToken: token, tokenType: 'Bearer', user },
});

/** Handler nền mà HẦU HẾT màn đã đăng nhập đều gọi — để test không chạm mạng thật. */
export const shellHandlers = [
  http.get('*/capabilities', () =>
    HttpResponse.json({
      success: true,
      data: {
        version: '1.0.0',
        features: {},
        limits: {},
        upload: { maxFileBytes: 1, allowedMime: [], signedUrlTtlSeconds: 300 },
      },
    }),
  ),
  http.get('*/admin/overview', () =>
    HttpResponse.json({
      success: true,
      data: {
        newUsers7d: 0,
        activeWorkspaces: 0,
        openReports: 0,
        failedAiJobs24h: 0,
        activeUsersSeries: [],
        realtime: { socketConnections: 0, onlineUsers: 0 },
      },
    }),
  ),
];

/**
 * Trả auth store + cache về trạng thái "vừa mở trình duyệt, chưa biết gì". Xoá cả toast: store toast là
 * singleton nên toast của bài trước (sống tới 8 s) làm hỏng các câu khẳng định "không có toast/lời nhắn".
 */
export function resetAuth(): void {
  useToastStore.setState({ toasts: [] });
  queryClient.clear();
  localStorage.clear();
  useAuthStore.setState({ user: null, token: null, status: 'idle', endReason: null });
}

/** Đang đăng nhập (token còn hạn theo `exp` vì token giả không có `exp`). */
export function signIn(user: AuthUser = OPS_USER, token = 'token-cu'): void {
  resetAuth();
  useAuthStore.getState().setAuth({ user, token });
}

/** Mô phỏng "F5 khi lần trước còn đăng nhập": có hồ sơ đã persist nhưng chưa có token trong bộ nhớ. */
export function simulateReload(user: AuthUser | null): void {
  resetAuth();
  useAuthStore.setState({ user });
}

export function renderApp(initialEntries: InitialEntry[]) {
  const router = createMemoryRouter(routes, { initialEntries });
  const utils = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return { router, ...utils };
}
