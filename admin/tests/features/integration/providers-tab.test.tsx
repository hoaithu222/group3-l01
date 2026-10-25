/**
 * Tab "Nhà cung cấp" (p5-03 admin.md §2.2/§4): công tắc Bật KHOÁ khi chưa cấu hình khoá hoặc thiếu `integration:update`; tắt → lý do →
 * `PUT /admin/integrations/providers/:provider { enabled, reason }`. Mock tầng HTTP (MSW).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import ProvidersTab from '@/features/integration/components/ProvidersTab';

import { makeProvider, okBody, renderAt, signIn } from './integration-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => useAuthStore.getState().clearAuth());

const rows = [
  makeProvider(),
  makeProvider({ provider: 'GITLAB', key: 'gitlab', label: 'GitLab', configured: false, enabled: true, available: false }),
];

function mockProviders() {
  server.use(http.get('*/admin/integrations/providers', () => okBody(rows)));
}

describe('ProvidersTab', () => {
  it('chưa cấu hình khoá → công tắc bị khoá; chỉ integration:view → mọi công tắc bị khoá', async () => {
    signIn(['integration:view', 'integration:update']);
    mockProviders();
    const first = renderAt(<ProvidersTab />, '/integration?tab=providers');
    expect(await screen.findByRole('switch', { name: 'Bật GitHub' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Bật GitLab' })).toBeDisabled();
    expect(screen.getByText('Thiếu khoá')).toBeInTheDocument();
    first.unmount();

    signIn(['integration:view']);
    renderAt(<ProvidersTab />, '/integration?tab=providers');
    expect(await screen.findByRole('switch', { name: 'Bật GitHub' })).toBeDisabled();
  });

  it('tắt GitHub: nêu tác động, bắt buộc lý do, gửi PUT { enabled:false, reason }', async () => {
    signIn(['integration:view', 'integration:update']);
    mockProviders();
    let put: unknown = null;
    server.use(
      http.put('*/admin/integrations/providers/GITHUB', async ({ request }) => {
        put = await request.json();
        return okBody(makeProvider({ enabled: false, available: false }));
      }),
    );
    renderAt(<ProvidersTab />, '/integration?tab=providers');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: 'Bật GitHub' }));
    expect(await screen.findByText(/webhook mới của nhà cung cấp sẽ bị bỏ qua/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Lý do/), 'Tạm dừng để kiểm tra bảo mật');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() =>
      expect(put).toEqual({ enabled: false, reason: 'Tạm dừng để kiểm tra bảo mật' }),
    );
  });
});
