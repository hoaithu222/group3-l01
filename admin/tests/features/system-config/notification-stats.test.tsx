/**
 * Khối "Số liệu thông báo tin nhắn" (p1-07 admin.md §2.1, §4) + mặc định thông báo của tab
 * `notifications`:
 * - render số liệu gộp từ `GET /admin/notifications/stats`, nhãn tiếng Việt, p95 fan-out;
 * - đổi khoảng 24 giờ/7 ngày gọi lại API đúng `range` và đồng bộ URL (`?notifRange=`);
 * - 0 an toàn (cờ `push` tắt / Redis lỗi → toàn 0, `fanoutP95Ms: null`);
 * - RIÊNG TƯ: không trường định danh người dùng nào lên DOM kể cả khi BE lỡ trả thừa;
 * - lưu `notification.defaults`: hộp thoại lý do nói đúng tác động của khoá này;
 * - người chỉ có `system-config:view` không thấy nút Lưu/Gửi thử.
 *
 * Mock ở tầng HTTP (MSW) để đi đúng đường thật (axios interceptor, React Query).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import NotificationStatsPanel from '@/features/system-config/notifications/components/NotificationStatsPanel';
import NotificationsTab from '@/features/system-config/notifications/NotificationsTab';
import type { NotificationStats } from '@/features/system-config/notifications/types/notification-stats.types';
import {
  formatFanoutP95,
  toSuppressedPoints,
} from '@/features/system-config/notifications/utils/notification-stats';

import LocationProbe from '../user/LocationProbe';

const STATS_24H: NotificationStats = {
  range: '24h',
  pushSent: 1234,
  pushFailed: 7,
  invalidTokensRemoved: 3,
  suppressed: { muted: 40, dnd: 15, viewing: 4, read: 2, blocked: 1 },
  fanoutP95Ms: 500,
  inboxCreated: 88,
  byType: { 'message.new': 900, mention: 300, 'thread.reply': 34, 'brand.new-type': 5 },
};

const STATS_7D: NotificationStats = {
  ...STATS_24H,
  range: '7d',
  pushSent: 9000,
  pushFailed: 0,
  fanoutP95Ms: 2000,
};

const DEFAULTS_ITEM = {
  key: 'notification.defaults',
  tab: 'notifications',
  label: 'Mặc định thông báo',
  fields: [{ path: 'sound', label: 'Âm thanh trong ứng dụng', kind: 'bool', default: true }],
  stored: {},
  effective: { sound: true },
  version: 4,
  updatedAt: null,
  updatedBy: null,
};

const ranges: string[] = [];

const server = setupServer(
  http.get('*/admin/notifications/stats', ({ request }) => {
    const range = new URL(request.url).searchParams.get('range') ?? '';
    ranges.push(range);
    return HttpResponse.json({ success: true, data: range === '7d' ? STATS_7D : STATS_24H });
  }),
  http.get('*/admin/system-config', () =>
    HttpResponse.json({ success: true, data: [DEFAULTS_ITEM] }),
  ),
  http.get('*/admin/push/status', () =>
    HttpResponse.json({
      success: true,
      data: {
        pushEnabled: true,
        fcm: { configured: true },
        voip: { configured: false, environment: null },
      },
    }),
  ),
  http.get('*/admin/push/stats', () =>
    HttpResponse.json({
      success: true,
      data: {
        generatedAt: '2026-09-21T03:30:00.000Z',
        push24h: { sent: 1, failed: 0, skipped: { total: 0, byReason: {} } },
        tokensRevoked7d: { total: 0, byReason: {} },
      },
    }),
  ),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features: {} } })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  ranges.length = 0;
});
afterAll(() => server.close());

function signIn(permissions: string[], roles: string[] = ['manager']) {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Vận hành', roles, permissions },
    token: 'test-token',
  });
}

beforeEach(() => signIn(['system-config:view']));

function renderUi(ui: React.ReactElement, url = '/') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            {ui}
            <LocationProbe />
          </>
        ),
      },
    ],
    { initialEntries: [url] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/**
 * Giá trị đích của thẻ KPI (bản `sr-only` của `AnimatedNumber`, không phụ thuộc hoạt ảnh).
 * Số ≥ 1.000 được định dạng theo locale nên so sánh sau khi bỏ dấu phân cách.
 */
function kpiValue(label: string): string | null {
  const el = screen.getByText(label).closest('div.border-l-2');
  if (!el) throw new Error(`Không tìm thấy thẻ KPI "${label}"`);
  return (el.querySelector('.sr-only')?.textContent ?? '').replace(/[.,\s]/g, '');
}

const location = () => screen.getByTestId('location').textContent;

describe('NotificationStatsPanel', () => {
  it('render số liệu 24 giờ: push gửi/thất bại, token dọn, mục Hoạt động, p95, theo loại', async () => {
    renderUi(<NotificationStatsPanel />);

    await screen.findByText('Push đã gửi');
    expect(kpiValue('Push đã gửi')).toBe('1234');
    expect(kpiValue('Push thất bại')).toBe('7');
    expect(kpiValue('Token hỏng đã dọn')).toBe('3');
    expect(kpiValue('Mục Hoạt động mới')).toBe('88');
    expect(screen.getByText(/Thời gian fan-out p95: ≤ 500 ms/)).toBeInTheDocument();
    expect(ranges).toEqual(['24h']);

    // Loại push: nhãn tiếng Việt, nhiều trước; loại lạ hiện thô.
    const cells = screen.getAllByRole('row').map((r) => r.textContent);
    const indexOf = (text: string) => cells.findIndex((c) => c?.includes(text));
    expect(indexOf('Tin nhắn mới')).toBeGreaterThan(0);
    expect(indexOf('Tin nhắn mới')).toBeLessThan(indexOf('Nhắc tên'));
    expect(indexOf('Nhắc tên')).toBeLessThan(indexOf('Trả lời trong luồng'));
    expect(indexOf('Trả lời trong luồng')).toBeLessThan(indexOf('brand.new-type'));
  });

  it('push bị chặn theo lý do: nhãn tiếng Việt, đủ 5 lý do kể cả bằng 0', async () => {
    renderUi(<NotificationStatsPanel />);

    const list = await screen.findByRole('list', { name: 'Push bị chặn theo lý do' });
    const items = Array.from(list.querySelectorAll('li')).map((li) => li.textContent);
    expect(items).toEqual([
      'Đã tắt tiếng: 40',
      'Không làm phiền: 15',
      'Đang xem: 4',
      'Đã đọc: 2',
      'Đã chặn: 1',
    ]);
  });

  it('đổi sang 7 ngày → gọi lại API với range=7d và đồng bộ URL; về 24 giờ thì bỏ khoá', async () => {
    renderUi(<NotificationStatsPanel />);
    const user = userEvent.setup();

    await screen.findByText('Push đã gửi');
    expect(location()).toBe('/');

    await user.click(screen.getByRole('button', { name: '7 ngày' }));
    await waitFor(() => expect(ranges).toEqual(['24h', '7d']));
    await waitFor(() => expect(kpiValue('Push đã gửi')).toBe('9000'));
    expect(location()).toBe('/?notifRange=7d');
    expect(screen.getByRole('button', { name: '7 ngày' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Thời gian fan-out p95: ≤ 2 giây/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '24 giờ' }));
    await waitFor(() => expect(location()).toBe('/'));
  });

  it('vào thẳng bằng ?notifRange=7d → gọi range=7d ngay; giá trị lạ rơi về 24h', async () => {
    renderUi(<NotificationStatsPanel />, '/?notifRange=7d');
    await screen.findByText('Push đã gửi');
    expect(ranges).toEqual(['7d']);
  });

  it('0 an toàn (cờ push tắt / Redis lỗi): toàn 0, p95 null → "Chưa có dữ liệu", không lỗi', async () => {
    server.use(
      http.get('*/admin/notifications/stats', () =>
        HttpResponse.json({
          success: true,
          data: {
            range: '24h',
            pushSent: 0,
            pushFailed: 0,
            invalidTokensRemoved: 0,
            suppressed: { muted: 0, dnd: 0, viewing: 0, read: 0, blocked: 0 },
            fanoutP95Ms: null,
            inboxCreated: 0,
            byType: { 'message.new': 0, mention: 0, 'thread.reply': 0 },
          } satisfies NotificationStats,
        }),
      ),
    );
    renderUi(<NotificationStatsPanel />);

    await screen.findByText('Push đã gửi');
    expect(kpiValue('Push đã gửi')).toBe('0');
    expect(kpiValue('Push thất bại')).toBe('0');
    expect(screen.getByText('Thời gian fan-out p95: Chưa có dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('Không có push nào bị chặn trong khoảng này.')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được số liệu thông báo tin nhắn')).not.toBeInTheDocument();
  });

  it('RIÊNG TƯ: BE lỡ trả thừa định danh/nội dung → không có gì lên DOM', async () => {
    server.use(
      http.get('*/admin/notifications/stats', () =>
        HttpResponse.json({
          success: true,
          data: {
            ...STATS_24H,
            userId: '64b000000000000000000001',
            email: 'leak-user@example.com',
            topUsers: [{ userId: 'leak-id-9', name: 'Nguoi Bi Lo', count: 99 }],
            sample: { excerpt: 'Noi dung tin nhan bi lo' },
          },
        }),
      ),
    );
    const { container } = renderUi(<NotificationStatsPanel />);

    await screen.findByText('Push đã gửi');
    const html = container.innerHTML;
    for (const leak of ['leak', 'Bi Lo', 'Noi dung tin nhan', '64b000000000000000000001']) {
      expect(html).not.toContain(leak);
    }
  });

  it('BE lỗi → thông báo lỗi + "Thử lại" gọi lại API và hiện số liệu', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/notifications/stats', () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            { success: false, error: { code: 'SYS_500', message: 'Lỗi hệ thống' } },
            { status: 500 },
          );
        }
        return HttpResponse.json({ success: true, data: STATS_24H });
      }),
    );
    renderUi(<NotificationStatsPanel />);
    const user = userEvent.setup();

    expect(
      await screen.findByText('Không tải được số liệu thông báo tin nhắn'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Push đã gửi')).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

describe('NotificationsTab — mặc định thông báo (notification.defaults)', () => {
  it('lưu: hộp thoại lý do nói đúng tác động của khoá này, lý do < 10 ký tự không gửi', async () => {
    signIn(['system-config:view', 'system-config:update']);
    let putCalls = 0;
    server.use(
      http.put('*/admin/system-config/:key', () => {
        putCalls += 1;
        return HttpResponse.json({ success: true, data: DEFAULTS_ITEM });
      }),
    );
    renderUi(<NotificationsTab />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: /Âm thanh trong ứng dụng/ }));
    await user.click(await screen.findByRole('button', { name: 'Lưu nhóm' }));

    expect(
      await screen.findByText(/Áp dụng cho người dùng chưa tự chỉnh cài đặt thông báo/),
    ).toBeInTheDocument();
    // Không phải câu chung "áp dụng cho mọi người dùng".
    expect(screen.queryByText(/Giá trị áp dụng cho mọi người dùng/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Lý do/), 'ngan');
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(putCalls).toBe(0);
  });

  it('chỉ có system-config:view → không có nút Lưu nhóm; số liệu vẫn hiện', async () => {
    renderUi(<NotificationsTab />);

    expect(await screen.findByText('Mặc định thông báo')).toBeInTheDocument();
    expect(await screen.findByText('Số liệu thông báo tin nhắn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu nhóm' })).not.toBeInTheDocument();
    expect(screen.queryByText('Gửi push thử')).not.toBeInTheDocument();
  });
});

describe('notification-stats utils', () => {
  it('formatFanoutP95: cận trên "≤", giây khi ≥ 1000, bucket tràn "> 5 giây", null chưa có dữ liệu', () => {
    expect(formatFanoutP95(100)).toBe('≤ 100 ms');
    expect(formatFanoutP95(1000)).toBe('≤ 1 giây');
    expect(formatFanoutP95(2000)).toBe('≤ 2 giây');
    expect(formatFanoutP95(5000)).toBe('≤ 5 giây');
    expect(formatFanoutP95(10_000)).toBe('> 5 giây');
    expect(formatFanoutP95(null)).toBe('Chưa có dữ liệu');
  });

  it('toSuppressedPoints: đúng thứ tự cố định, thiếu khoá → 0', () => {
    const points = toSuppressedPoints({ muted: 1 } as NotificationStats['suppressed']);
    expect(points.map((p) => p.key)).toEqual(['muted', 'dnd', 'viewing', 'read', 'blocked']);
    expect(points.map((p) => p.count)).toEqual([1, 0, 0, 0, 0]);
  });
});
