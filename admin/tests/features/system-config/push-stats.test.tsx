/**
 * Số liệu push và trạng thái nhà cung cấp của tab `notifications` (p0-06
 * admin.md §2.1, §2.3, §4) — render số liệu từ BE, nhãn lý do bằng tiếng Việt,
 * trạng thái lỗi/thử lại, và trạng thái provider KHÔNG lộ khoá/secret.
 *
 * Mock ở tầng HTTP (MSW) để đi đúng đường thật (axios interceptor, React Query).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import NotificationsTab from '@/features/system-config/notifications/NotificationsTab';
import PushProviderCard from '@/features/system-config/notifications/components/PushProviderCard';
import PushStatsStrip from '@/features/system-config/notifications/components/PushStatsStrip';
import { SYSTEM_CONFIG_TABS } from '@/features/system-config/tabs/tab-registry';

const STATS = {
  generatedAt: '2026-09-19T03:30:00.000Z',
  push24h: {
    sent: 1234,
    failed: 7,
    skipped: { total: 60, byReason: { MUTED: 40, DND: 15, VIEWING: 4, NO_DEVICE: 1 } },
  },
  tokensRevoked7d: { total: 9, byReason: { FCM_UNREGISTERED: 6, LOGOUT: 2, BRAND_NEW_REASON: 1 } },
};

const STATUS_ALL_ON = {
  pushEnabled: true,
  fcm: { configured: true },
  voip: { configured: true, environment: 'SANDBOX' },
};

const server = setupServer(
  http.get('*/admin/push/stats', () => HttpResponse.json({ success: true, data: STATS })),
  http.get('*/admin/push/status', () => HttpResponse.json({ success: true, data: STATUS_ALL_ON })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: {
      id: 'me',
      email: 'a@x.vn',
      name: 'Admin',
      roles: ['manager'],
      permissions: ['system-config:view'],
    },
    token: 'test-token',
  });
});

function renderWithProviders(ui: React.ReactElement) {
  // `Form` (kit2) gọi `useBlocker` ⇒ cần data router (tab có chứa form gửi thử).
  const router = createMemoryRouter([{ path: '/', element: ui }]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** Thẻ KPI = phần tử chứa nhãn đó; trả về các truy vấn trong phạm vi thẻ. */
function kpi(label: string) {
  const el = screen.getByText(label).closest('div.border-l-2') as HTMLElement | null;
  if (!el) throw new Error(`Không tìm thấy thẻ KPI "${label}"`);
  return within(el);
}

describe('PushStatsStrip', () => {
  it('render 3 số liệu từ BE: push gửi 24 giờ, bị bỏ qua 24 giờ, token bị gỡ 7 ngày', async () => {
    renderWithProviders(<PushStatsStrip />);

    await screen.findByText('Push gửi (24 giờ)');
    // Số đếm lên tới giá trị cuối (AnimatedNumber) — đợi cả ba về đúng số.
    await waitFor(() => {
      expect(kpi('Push gửi (24 giờ)').getByText(/^1[.,\s]?234$/)).toBeInTheDocument();
      expect(kpi('Bị bỏ qua (24 giờ)').getByText('60')).toBeInTheDocument();
      expect(kpi('Token bị gỡ (7 ngày)').getByText('9')).toBeInTheDocument();
    });
  });

  it('push lỗi > 0 → hiện huy hiệu "Lỗi N" cạnh số push gửi', async () => {
    renderWithProviders(<PushStatsStrip />);

    await screen.findByText('Push gửi (24 giờ)');
    expect(await kpi('Push gửi (24 giờ)').findByText('Lỗi 7')).toBeInTheDocument();
  });

  it('không có push lỗi → không hiện huy hiệu "Lỗi"', async () => {
    server.use(
      http.get('*/admin/push/stats', () =>
        HttpResponse.json({
          success: true,
          data: { ...STATS, push24h: { ...STATS.push24h, failed: 0 } },
        }),
      ),
    );
    renderWithProviders(<PushStatsStrip />);

    await screen.findByText('Push gửi (24 giờ)');
    expect(screen.queryByText(/^Lỗi \d/)).not.toBeInTheDocument();
  });

  it('bỏ qua theo lý do bằng tiếng Việt, nhiều trước; token gỡ theo lý do; mã lạ hiện thô', async () => {
    renderWithProviders(<PushStatsStrip />);

    await screen.findByText('Push gửi (24 giờ)');
    const skipped = kpi('Bị bỏ qua (24 giờ)');
    expect(skipped.getByText('Đã tắt tiếng · 40')).toBeInTheDocument();
    expect(skipped.getByText('Không làm phiền · 15')).toBeInTheDocument();
    expect(skipped.getByText('Đang xem · 4')).toBeInTheDocument();
    expect(skipped.getByText('Không có thiết bị · 1')).toBeInTheDocument();
    // Thứ tự: lý do nhiều nhất trước.
    const chips = skipped.getAllByText(/ · \d+$/).map((e) => e.textContent);
    expect(chips).toEqual([
      'Đã tắt tiếng · 40',
      'Không làm phiền · 15',
      'Đang xem · 4',
      'Không có thiết bị · 1',
    ]);

    const revoked = kpi('Token bị gỡ (7 ngày)');
    expect(revoked.getByText('FCM báo token hết hạn · 6')).toBeInTheDocument();
    expect(revoked.getByText('Đăng xuất · 2')).toBeInTheDocument();
    expect(revoked.getByText('BRAND_NEW_REASON · 1')).toBeInTheDocument();
  });

  it('không có bản ghi nào bị bỏ qua/gỡ → hiện câu "không có", không có huy hiệu lý do', async () => {
    server.use(
      http.get('*/admin/push/stats', () =>
        HttpResponse.json({
          success: true,
          data: {
            generatedAt: STATS.generatedAt,
            push24h: { sent: 0, failed: 0, skipped: { total: 0, byReason: {} } },
            tokensRevoked7d: { total: 0, byReason: {} },
          },
        }),
      ),
    );
    renderWithProviders(<PushStatsStrip />);

    expect(await screen.findByText('Không có thông báo nào bị bỏ qua')).toBeInTheDocument();
    expect(screen.getByText('Không có token nào bị gỡ')).toBeInTheDocument();
  });

  it('BE lỗi → thông báo lỗi + "Thử lại" gọi lại API và hiện số liệu', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/push/stats', () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            { success: false, error: { code: 'SYS_001', message: 'Lỗi hệ thống' } },
            { status: 500 },
          );
        }
        return HttpResponse.json({ success: true, data: STATS });
      }),
    );
    renderWithProviders(<PushStatsStrip />);
    const user = userEvent.setup();

    expect(await screen.findByText('Không tải được số liệu thông báo đẩy')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Push gửi (24 giờ)')).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

describe('PushProviderCard', () => {
  it('FCM + VoIP đã cấu hình → "Đã cấu hình" và "Đã cấu hình (sandbox)"', async () => {
    renderWithProviders(<PushProviderCard />);

    expect(await screen.findByText('Đã cấu hình')).toBeInTheDocument();
    expect(screen.getByText('Đã cấu hình (sandbox)')).toBeInTheDocument();
    expect(screen.queryByText('Tính năng thông báo đẩy đang tắt')).not.toBeInTheDocument();
  });

  it('VoIP môi trường production → "Đã cấu hình (production)"', async () => {
    server.use(
      http.get('*/admin/push/status', () =>
        HttpResponse.json({
          success: true,
          data: { ...STATUS_ALL_ON, voip: { configured: true, environment: 'PRODUCTION' } },
        }),
      ),
    );
    renderWithProviders(<PushProviderCard />);

    expect(await screen.findByText('Đã cấu hình (production)')).toBeInTheDocument();
  });

  it('thiếu cấu hình → "Chưa cấu hình (push tắt)" cho FCM và "Chưa cấu hình" cho VoIP', async () => {
    server.use(
      http.get('*/admin/push/status', () =>
        HttpResponse.json({
          success: true,
          data: {
            pushEnabled: false,
            fcm: { configured: false },
            voip: { configured: false, environment: null },
          },
        }),
      ),
    );
    renderWithProviders(<PushProviderCard />);

    expect(await screen.findByText('Chưa cấu hình (push tắt)')).toBeInTheDocument();
    expect(screen.getByText('Chưa cấu hình')).toBeInTheDocument();
    expect(screen.getByText('Tính năng thông báo đẩy đang tắt')).toBeInTheDocument();
  });

  it('RIÊNG TƯ: BE lỡ trả thừa khoá/secret → giao diện không hiện ra', async () => {
    server.use(
      http.get('*/admin/push/status', () =>
        HttpResponse.json({
          success: true,
          data: {
            ...STATUS_ALL_ON,
            // Những thứ BE thật KHÔNG trả — giả một BE lỡ tay để chứng minh UI tự chốt chặn.
            fcm: {
              configured: true,
              projectId: 'leak-project-id',
              clientEmail: 'leak@leak-project.iam.gserviceaccount.com',
              privateKey: '-----BEGIN PRIVATE KEY-----LEAKED-FCM-KEY',
            },
            voip: {
              configured: true,
              environment: 'SANDBOX',
              keyId: 'LEAKKEYID1',
              teamId: 'LEAKTEAM12',
              privateKey: '-----BEGIN PRIVATE KEY-----LEAKED-P8',
            },
          },
        }),
      ),
    );
    const { container } = renderWithProviders(<PushProviderCard />);

    await screen.findByText('Đã cấu hình (sandbox)');
    const html = container.innerHTML;
    for (const secret of ['leak', 'LEAK', 'PRIVATE KEY']) {
      expect(html).not.toContain(secret);
    }
  });

  it('BE lỗi → thông báo lỗi + "Thử lại"', async () => {
    server.use(
      http.get('*/admin/push/status', () =>
        HttpResponse.json(
          { success: false, error: { code: 'SYS_001', message: 'Lỗi hệ thống' } },
          { status: 500 },
        ),
      ),
    );
    renderWithProviders(<PushProviderCard />);

    expect(await screen.findByText('Không tải được trạng thái nhà cung cấp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});

describe('NotificationsTab', () => {
  it('đã đăng ký vào tab-registry với khoá `notifications`', () => {
    expect(SYSTEM_CONFIG_TABS.notifications).toBeDefined();
  });

  it('người chỉ có system-config:view thấy trạng thái + số liệu, KHÔNG thấy công cụ gửi thử', async () => {
    renderWithProviders(<NotificationsTab />);

    expect(await screen.findByText('Nhà cung cấp thông báo đẩy')).toBeInTheDocument();
    expect(await screen.findByText('Số liệu thông báo đẩy')).toBeInTheDocument();
    expect(screen.queryByText('Gửi push thử')).not.toBeInTheDocument();
  });

  it('admin thấy cả ba khối', async () => {
    useAuthStore.getState().setAuth({
      user: { id: 'me', email: 'a@x.vn', name: 'Admin', roles: ['admin'], permissions: [] },
      token: 'test-token',
    });
    renderWithProviders(<NotificationsTab />);

    expect(await screen.findByText('Nhà cung cấp thông báo đẩy')).toBeInTheDocument();
    expect(await screen.findByText('Số liệu thông báo đẩy')).toBeInTheDocument();
    expect(screen.getByText('Gửi push thử')).toBeInTheDocument();
  });
});
