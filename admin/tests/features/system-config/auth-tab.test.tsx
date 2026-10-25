/**
 * Tab `auth` của trang `system-config` (p0-07 admin.md, p0-13) — khoá registry `auth` với field path
 * LỒNG (`biometricLogin.enabled`, `appLock.enabled`, `appLock.lockAfterBackgroundSeconds`): form sinh
 * từ metadata BE, `PUT` gửi object lồng + `expectedVersion` + lý do, `CFG_002.details.path` (dạng
 * chấm) gắn đúng ô, và quyền chỉ-xem. Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import { SYSTEM_CONFIG_TABS } from '@/features/system-config/tabs/tab-registry';
import AuthTab from '@/features/system-config/tabs/AuthTab';

interface PutBody {
  value: Record<string, unknown>;
  expectedVersion: number;
  reason: string;
}

const AUTH_ITEM = {
  key: 'auth',
  tab: 'auth',
  label: 'Xác thực',
  fields: [
    { path: 'biometricLogin.enabled', label: 'Đăng nhập sinh trắc học', kind: 'bool', default: true },
    { path: 'appLock.enabled', label: 'Khoá ứng dụng', kind: 'bool', default: true },
    {
      path: 'appLock.lockAfterBackgroundSeconds',
      label: 'Khoá sau khi chạy nền (giây)',
      kind: 'int',
      default: 300,
      floor: 60,
      ceil: 3600,
      unit: 's',
    },
  ],
  stored: {},
  effective: {
    biometricLogin: { enabled: true },
    appLock: { enabled: true, lockAfterBackgroundSeconds: 300 },
  },
  version: 4,
  updatedAt: null,
  updatedBy: null,
};

// Khoá thuộc tab khác — KHÔNG được hiện ở tab Xác thực.
const LIMITS_ITEM = { ...AUTH_ITEM, key: 'limits.message', tab: 'limits', label: 'Tin nhắn' };

let lastPut: PutBody | null = null;

const server = setupServer(
  http.get('*/admin/system-config', () =>
    HttpResponse.json({ success: true, data: [LIMITS_ITEM, AUTH_ITEM] }),
  ),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features: {} } })),
  http.put('*/admin/system-config/:key', async ({ request }) => {
    lastPut = (await request.json()) as PutBody;
    return HttpResponse.json({
      success: true,
      data: { ...AUTH_ITEM, stored: lastPut.value, version: AUTH_ITEM.version + 1 },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function signIn(permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Admin', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

// `Form` (kit2) gọi `useBlocker` ⇒ cần data router, không chạy được dưới `MemoryRouter`.
function renderTab() {
  const router = createMemoryRouter([{ path: '/', element: <AuthTab /> }]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function fillReasonAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Lưu nhóm' }));
  await user.type(await screen.findByLabelText(/Lý do/), 'Tạm tắt khoá app để xử lý sự cố');
  await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
}

describe('AuthTab', () => {
  beforeEach(() => {
    lastPut = null;
    useAuthStore.getState().clearAuth();
  });

  it('tab `auth` đã đăng ký trong tab-registry (không còn bị ẩn dù BE khai tab auth)', () => {
    expect(SYSTEM_CONFIG_TABS.auth).toBeDefined();
  });

  it('dựng ô từ field path lồng, chỉ khoá tab auth; nhãn không lặp đơn vị "(giây) (giây)"', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderTab();

    expect(await screen.findByText('Xác thực')).toBeInTheDocument();
    expect(screen.queryByText('Tin nhắn')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Đăng nhập sinh trắc học/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Khoá ứng dụng/ })).toBeChecked();
    // Giá trị hiệu lực LỒNG (`effective.appLock.lockAfterBackgroundSeconds`) đi vào ô số.
    expect(screen.getByLabelText('Khoá sau khi chạy nền (giây)')).toHaveValue('300');
    expect(screen.getByText(/Mặc định: 300 giây · Trần: 3\.600 giây/)).toBeInTheDocument();
  });

  it('tắt khoá app rồi lưu → PUT gửi object LỒNG, chỉ ô khác mặc định, đúng expectedVersion', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderTab();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: /Khoá ứng dụng/ }));
    expect(await screen.findByText('Đã tuỳ chỉnh')).toBeInTheDocument();
    await fillReasonAndConfirm(user);

    await waitFor(() => expect(lastPut).not.toBeNull());
    expect(lastPut).toMatchObject({
      value: { appLock: { enabled: false } },
      expectedVersion: 4,
      reason: 'Tạm tắt khoá app để xử lý sự cố',
    });
    // Không có khoá phẳng kiểu `"appLock.enabled"` hay `appLock__enabled` lọt vào body.
    expect(Object.keys(lastPut?.value ?? {})).toEqual(['appLock']);
  });

  it('đổi số giây: nằm cùng nhánh `appLock` với ô bật/tắt', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderTab();
    const user = userEvent.setup();

    const input = await screen.findByLabelText('Khoá sau khi chạy nền (giây)');
    await user.clear(input);
    await user.type(input, '600');
    await user.click(await screen.findByRole('switch', { name: /Đăng nhập sinh trắc học/ }));
    await fillReasonAndConfirm(user);

    await waitFor(() => expect(lastPut).not.toBeNull());
    expect(lastPut?.value).toEqual({
      biometricLogin: { enabled: false },
      appLock: { lockAfterBackgroundSeconds: 600 },
    });
  });

  it('400 CFG_002 với details.path dạng chấm → lỗi gắn đúng ô lồng', async () => {
    signIn(['system-config:view', 'system-config:update']);
    server.use(
      http.put('*/admin/system-config/:key', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'CFG_002',
              message: 'Giá trị nằm ngoài giới hạn cho phép',
              details: { path: 'appLock.lockAfterBackgroundSeconds', floor: 60, ceil: 1800 },
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderTab();
    const user = userEvent.setup();

    const input = await screen.findByLabelText('Khoá sau khi chạy nền (giây)');
    await user.clear(input);
    await user.type(input, '900');
    await fillReasonAndConfirm(user);

    expect(await screen.findByText('Giá trị nằm ngoài giới hạn cho phép')).toBeInTheDocument();
  });

  it('chỉ có system-config:view → thấy nhóm nhưng không có nút lưu/khôi phục', async () => {
    signIn(['system-config:view']);
    renderTab();

    expect(await screen.findByText('Xác thực')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Lưu nhóm' })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /Khôi phục mặc định/ })).toHaveLength(0);
  });
});
