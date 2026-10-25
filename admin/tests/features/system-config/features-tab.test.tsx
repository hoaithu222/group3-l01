/**
 * Tab `features` (p0-07 admin.md §2.3, CFG-09) — toggle khoá khi phân hệ chưa
 * có mã hoặc bị chặn D-13, tắt có cảnh báo tác động, và gửi đúng override.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import FeaturesTab from '@/features/system-config/tabs/FeaturesTab';

interface PutBody {
  value: Record<string, unknown>;
  expectedVersion: number;
  reason: string;
}

const FEATURES_ITEM = {
  key: 'features',
  tab: 'features',
  label: 'Tính năng',
  fields: [
    { path: 'communication', label: 'Nhắn tin & kênh', kind: 'bool', default: false },
    { path: 'push', label: 'Thông báo đẩy', kind: 'bool', default: true },
    { path: 'ai', label: 'Trợ lý AI', kind: 'bool', default: false },
  ],
  // `push` đang bị ghi đè runtime; `communication` dùng mặc định env.
  stored: { push: true },
  effective: { communication: false, push: true, ai: false },
  version: 7,
  updatedAt: null,
  updatedBy: null,
};

const CAPABILITIES = {
  features: {
    communication: { enabled: false, available: false },
    push: { enabled: true, available: true },
    ai: { enabled: false, available: false, blocked: 'D-13' },
  },
};

let lastPut: PutBody | null = null;

const server = setupServer(
  http.get('*/admin/system-config', () =>
    HttpResponse.json({ success: true, data: [FEATURES_ITEM] }),
  ),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: CAPABILITIES })),
  http.put('*/admin/system-config/:key', async ({ request }) => {
    lastPut = (await request.json()) as PutBody;
    return HttpResponse.json({
      success: true,
      data: { ...FEATURES_ITEM, stored: lastPut.value, version: 8 },
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
  const router = createMemoryRouter([{ path: '/', element: <FeaturesTab /> }]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('FeaturesTab', () => {
  beforeEach(() => {
    lastPut = null;
    useAuthStore.getState().clearAuth();
  });

  it('badge trạng thái mã + nguồn giá trị theo từng phân hệ', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderTab();

    expect(await screen.findByText('Nhắn tin & kênh')).toBeInTheDocument();
    expect(screen.getByText('Chưa có mã')).toBeInTheDocument();
    expect(screen.getByText('Sẵn sàng')).toBeInTheDocument();
    expect(screen.getByText('Tạm dừng (D-13)')).toBeInTheDocument();
    expect(screen.getByText('Ghi đè runtime')).toBeInTheDocument();
    expect(screen.getAllByText('Mặc định env')).toHaveLength(2);
  });

  it('CFG-09: phân hệ chưa có mã hoặc bị D-13 → toggle bị khoá', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderTab();
    await screen.findByText('Nhắn tin & kênh');

    expect(screen.getByRole('switch', { name: 'Bật/tắt Nhắn tin & kênh' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Bật/tắt Trợ lý AI' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Bật/tắt Thông báo đẩy' })).toBeEnabled();
  });

  it('tắt phân hệ: cảnh báo tác động, gửi override đầy đủ kèm expectedVersion', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderTab();
    await screen.findByText('Thông báo đẩy');

    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: 'Bật/tắt Thông báo đẩy' }));

    expect(
      await screen.findByText(/Người dùng đang dùng phân hệ sẽ thấy thông báo tính năng chưa bật/),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Lý do/), 'Bảo trì hệ thống thông báo');
    await user.click(screen.getByRole('button', { name: 'Tắt tính năng' }));

    await waitFor(() => expect(lastPut).not.toBeNull());
    expect(lastPut).toMatchObject({
      value: { push: false },
      expectedVersion: 7,
      reason: 'Bảo trì hệ thống thông báo',
    });
  });

  it('manager chỉ có system-config:view → mọi toggle bị khoá', async () => {
    signIn(['system-config:view']);
    renderTab();
    await screen.findByText('Thông báo đẩy');

    expect(screen.getByRole('switch', { name: 'Bật/tắt Thông báo đẩy' })).toBeDisabled();
  });
});
