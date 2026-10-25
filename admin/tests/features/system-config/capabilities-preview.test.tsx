/**
 * `CapabilitiesPreview` (tab Giới hạn/Tính năng) — nút mở/đóng khai `aria-expanded`; tải `/capabilities` lỗi phải
 * báo lỗi + "Thử lại" (trước đây chỉ có một dòng chữ mờ "thử lại sau" mà không có nút nào để thử lại).
 * Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import CapabilitiesPreview from '@/features/system-config/components/CapabilitiesPreview';

const CAPS = {
  version: 'cap-test-1',
  features: { communication: { enabled: true, available: true } },
  limits: {},
  upload: { maxFileBytes: 1, allowedMime: [], signedUrlTtlSeconds: 1 },
};

const ok = () => HttpResponse.json({ success: true, data: CAPS });
const fail = () =>
  HttpResponse.json(
    { success: false, error: { code: 'SYS_500', message: 'Lỗi máy chủ' } },
    { status: 500 },
  );

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Admin', roles: ['admin'], permissions: [] },
    token: 'test-token',
  });
});

function renderPreview() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CapabilitiesPreview />
    </QueryClientProvider>,
  );
}

describe('CapabilitiesPreview', () => {
  it('nút mở/đóng khai aria-expanded và hiện JSON khi mở', async () => {
    server.use(http.get('*/capabilities', ok));
    const user = userEvent.setup();
    renderPreview();

    const toggle = screen.getByRole('button', { name: 'Capabilities hiện hành' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/cap-test-1/)).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/cap-test-1/)).not.toBeInTheDocument();
  });

  it('tải lỗi: báo lỗi + "Thử lại"; thử lại thành công thì hiện JSON', async () => {
    server.use(http.get('*/capabilities', fail));
    const user = userEvent.setup();
    renderPreview();

    await user.click(screen.getByRole('button', { name: 'Capabilities hiện hành' }));
    expect(await screen.findByText('Không tải được capabilities')).toBeInTheDocument();

    server.use(http.get('*/capabilities', ok));
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText(/cap-test-1/)).toBeInTheDocument();
    expect(screen.queryByText('Không tải được capabilities')).not.toBeInTheDocument();
  });
});
