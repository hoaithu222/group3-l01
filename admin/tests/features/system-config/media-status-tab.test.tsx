/**
 * Tab "Media" của `system-config` (p0-08 admin.md §2, §4 — MED-09, D-24):
 * - `503 MEDIA_001` → Callout thiếu cấu hình + badge "Chưa cấu hình", không hiện số phòng;
 * - `reachable:false` → badge "Không kết nối" CÓ CHỮ (không chỉ màu);
 * - số phòng/người/egress đúng; `egress: null` → "không khả dụng", không bịa số 0;
 * - KHÔNG có khoá/secret LiveKit nào trong DOM kể cả khi BE lỡ trả thừa;
 * - lỗi mạng → "Thử lại" gọi lại API; tự làm mới 30 giây; đã đăng ký vào `tab-registry` không có cờ.
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
import MediaTab from '@/features/system-config/media/MediaTab';
import {
  MEDIA_SLOW_LATENCY_MS,
  MEDIA_STATUS_REFETCH_MS,
} from '@/features/system-config/media/constants/media.constants';
import { mediaKeys } from '@/features/system-config/media/service/media-status.queries';
import type { MediaStatus } from '@/features/system-config/media/types/media-status.types';
import { deriveMediaHealth } from '@/features/system-config/media/utils/media-health';
import { SYSTEM_CONFIG_TABS } from '@/features/system-config/tabs/tab-registry';

const HEALTHY: MediaStatus = {
  configured: true,
  reachable: true,
  latencyMs: 42,
  rooms: { active: 3, participants: 11 },
  egress: { active: 1, failed24h: 2 },
  lastWebhookAt: '2026-09-21T03:30:00.000Z',
};

const CAPS = {
  features: {
    voice: { enabled: false, available: false },
    meeting: { enabled: true, available: true },
  },
};

const server = setupServer(
  http.get('*/admin/media/status', () => HttpResponse.json({ success: true, data: HEALTHY })),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: CAPS })),
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
      name: 'Vận hành',
      roles: ['manager'],
      permissions: ['system-config:view'],
    },
    token: 'test-token',
  });
});

function renderTab() {
  const router = createMemoryRouter([{ path: '/', element: <MediaTab /> }]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

/**
 * Giá trị của thẻ KPI có nhãn đó. `AnimatedNumber` in số hai lần (bản `aria-hidden` đang chạy +
 * bản `sr-only` chốt ở đích) nên đọc bản `sr-only` — giá trị ĐÍCH, không phụ thuộc hoạt ảnh.
 */
function kpiValue(label: string): string | null {
  const el = screen.getByText(label).closest('div.border-l-2');
  if (!el) throw new Error(`Không tìm thấy thẻ KPI "${label}"`);
  return el.querySelector('.sr-only')?.textContent ?? null;
}

describe('MediaTab — trạng thái', () => {
  it('khoẻ mạnh → badge "Hoạt động", độ trễ, số phòng/người/egress đúng', async () => {
    renderTab();

    expect(await screen.findByText('Hoạt động')).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
    await screen.findByText('Phòng đang mở');
    expect(kpiValue('Phòng đang mở')).toBe('3');
    expect(kpiValue('Người đang tham gia')).toBe('11');
    expect(kpiValue('Egress đang ghi')).toBe('1');
    expect(kpiValue('Egress lỗi (24 giờ)')).toBe('2');
  });

  it('503 MEDIA_001 → Callout thiếu LIVEKIT_* + badge "Chưa cấu hình", KHÔNG có số phòng', async () => {
    server.use(
      http.get('*/admin/media/status', () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'MEDIA_001', message: 'Máy chủ media chưa được cấu hình' },
          },
          { status: 503 },
        ),
      ),
    );
    renderTab();

    expect(await screen.findByText('Máy chủ media chưa được cấu hình')).toBeInTheDocument();
    expect(screen.getByText(/Thiếu cấu hình LIVEKIT_\*/)).toBeInTheDocument();
    expect(screen.getByText('Chưa cấu hình')).toBeInTheDocument();
    expect(screen.queryByText('Phòng đang mở')).not.toBeInTheDocument();
    // Không phải lỗi mạng: không có nút "Thử lại".
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('reachable:false → badge "Không kết nối" có chữ, số phòng "không đọc được" (không bịa 0)', async () => {
    server.use(
      http.get('*/admin/media/status', () =>
        HttpResponse.json({
          success: true,
          data: { ...HEALTHY, reachable: false, latencyMs: null, rooms: null, egress: null },
        }),
      ),
    );
    renderTab();

    expect(await screen.findByText('Không kết nối')).toBeInTheDocument();
    expect(screen.getByText('Không kết nối được máy chủ media')).toBeInTheDocument();
    expect(screen.getByText(/Không đọc được số phòng/)).toBeInTheDocument();
    expect(screen.getByText(/Egress không khả dụng/)).toBeInTheDocument();
    expect(screen.queryByText('Phòng đang mở')).not.toBeInTheDocument();
  });

  it(`độ trễ ≥ ${MEDIA_SLOW_LATENCY_MS} ms → badge "Chậm"`, async () => {
    server.use(
      http.get('*/admin/media/status', () =>
        HttpResponse.json({
          success: true,
          data: { ...HEALTHY, latencyMs: MEDIA_SLOW_LATENCY_MS + 500 },
        }),
      ),
    );
    renderTab();

    expect(await screen.findByText('Chậm')).toBeInTheDocument();
    expect(screen.getByText('Máy chủ media đang chậm')).toBeInTheDocument();
  });

  it('egress: null (LiveKit chạy không kèm egress) → "Egress không khả dụng", phòng vẫn hiện', async () => {
    server.use(
      http.get('*/admin/media/status', () =>
        HttpResponse.json({ success: true, data: { ...HEALTHY, egress: null } }),
      ),
    );
    renderTab();

    expect(await screen.findByText(/Egress không khả dụng/)).toBeInTheDocument();
    expect(kpiValue('Phòng đang mở')).toBe('3');
    expect(screen.queryByText('Egress đang ghi')).not.toBeInTheDocument();
  });

  it('chưa nhận webhook nào → câu "Chưa nhận webhook nào"', async () => {
    server.use(
      http.get('*/admin/media/status', () =>
        HttpResponse.json({ success: true, data: { ...HEALTHY, lastWebhookAt: null } }),
      ),
    );
    renderTab();

    expect(await screen.findByText('Chưa nhận webhook nào')).toBeInTheDocument();
  });

  it('lỗi 500 → thông báo lỗi + "Thử lại" gọi lại API rồi hiện số liệu', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/media/status', () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            { success: false, error: { code: 'SYS_500', message: 'Lỗi hệ thống' } },
            { status: 500 },
          );
        }
        return HttpResponse.json({ success: true, data: HEALTHY });
      }),
    );
    renderTab();
    const user = userEvent.setup();

    expect(await screen.findByText('Không tải được trạng thái máy chủ media')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Hoạt động')).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

describe('MediaTab — cờ liên quan, làm mới, riêng tư', () => {
  it('hiện trạng thái cờ voice (tắt) và meeting (bật) + link sang tab Tính năng', async () => {
    renderTab();

    await screen.findByText('Gọi thoại/video');
    expect(await screen.findByText('Đang tắt')).toBeInTheDocument();
    expect(screen.getByText('Đang bật')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bật/tắt ở tab Tính năng' })).toHaveAttribute(
      'href',
      '/system-config?tab=features',
    );
  });

  it('tab hiện kể cả khi hai cờ voice/meeting tắt — không bọc FeatureGate', () => {
    expect(SYSTEM_CONFIG_TABS.media).toBeDefined();
    expect(SYSTEM_CONFIG_TABS.media.featureFlag).toBeUndefined();
  });

  it('tự làm mới 30 giây khi tab trình duyệt hiện (không polling nền)', async () => {
    const { queryClient } = renderTab();
    await screen.findByText('Hoạt động');

    const query = queryClient.getQueryCache().find({ queryKey: mediaKeys.status });
    const options = query?.options as
      { refetchInterval?: number; refetchIntervalInBackground?: boolean } | undefined;
    expect(MEDIA_STATUS_REFETCH_MS).toBe(30_000);
    expect(options?.refetchInterval).toBe(MEDIA_STATUS_REFETCH_MS);
    expect(options?.refetchIntervalInBackground).toBe(false);
  });

  it('nút "Làm mới" gọi lại API', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/media/status', () => {
        calls += 1;
        return HttpResponse.json({ success: true, data: HEALTHY });
      }),
    );
    renderTab();
    const user = userEvent.setup();

    await screen.findByText('Hoạt động');
    await user.click(screen.getByRole('button', { name: 'Làm mới' }));

    await waitFor(() => expect(calls).toBe(2));
  });

  it('RIÊNG TƯ (D-24): BE lỡ trả thừa khoá/secret/URL/định danh → giao diện không hiện ra', async () => {
    server.use(
      http.get('*/admin/media/status', () =>
        HttpResponse.json({
          success: true,
          data: {
            ...HEALTHY,
            // Những thứ BE thật KHÔNG trả — giả một BE lỡ tay để chứng minh UI tự chốt chặn.
            apiKey: 'APIleakKEY123',
            apiSecret: 'leak-secret-value',
            url: 'wss://leak-livekit.internal:7880',
            publicUrl: 'https://leak-host.example.com',
            participants: [{ identity: 'user-leak-1', name: 'Nguoi Ro Ri' }],
            rooms: { active: 3, participants: 11, names: ['call_leakroom'] },
          },
        }),
      ),
    );
    const { container } = renderTab();

    await screen.findByText('Hoạt động');
    const html = container.innerHTML;
    for (const secret of ['leak', 'APIleak', 'Ro Ri', 'wss://', 'call_']) {
      expect(html).not.toContain(secret);
    }
  });
});

describe('deriveMediaHealth', () => {
  it('chưa có dữ liệu / chưa cấu hình → NOT_CONFIGURED', () => {
    expect(deriveMediaHealth(undefined)).toBe('NOT_CONFIGURED');
    expect(deriveMediaHealth({ ...HEALTHY, configured: false })).toBe('NOT_CONFIGURED');
  });

  it('không với tới → UNREACHABLE (thắng cả độ trễ)', () => {
    expect(deriveMediaHealth({ ...HEALTHY, reachable: false, latencyMs: 9999 })).toBe(
      'UNREACHABLE',
    );
  });

  it('độ trễ đúng ngưỡng → SLOW; dưới ngưỡng hoặc null → OK', () => {
    expect(deriveMediaHealth({ ...HEALTHY, latencyMs: MEDIA_SLOW_LATENCY_MS })).toBe('SLOW');
    expect(deriveMediaHealth({ ...HEALTHY, latencyMs: MEDIA_SLOW_LATENCY_MS - 1 })).toBe('OK');
    expect(deriveMediaHealth({ ...HEALTHY, latencyMs: null })).toBe('OK');
  });
});
