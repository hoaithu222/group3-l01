/**
 * Đồ dùng chung cho bài kiểm phân hệ `integration` (p5-03 admin.md §4): fixture theo ĐÚNG hợp đồng BE
 * (`AdminEventRow`/`AdminEventDetail`/`AdminProviderRow`) và hàm dựng router + React Query. Không phải `*.test.*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type {
  AdminProviderRow,
  AdminWebhookEvent,
  AdminWebhookEventDetail,
} from '@/features/integration/types/integration.types';

export const okBody = (data: unknown, meta?: Record<string, unknown>) =>
  HttpResponse.json({ success: true, data, ...(meta && { meta }) });

export const pageMeta = (total: number, page = 1, limit = 50) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

export const EVENT_ID = '650000000000000000000abc';

export function makeEvent(over: Partial<AdminWebhookEvent> = {}): AdminWebhookEvent {
  return {
    id: EVENT_ID,
    provider: 'GITHUB',
    eventId: 'delivery-1',
    type: 'push',
    summary: 'dev-a đã push 3 commit lên main (vci/app)',
    status: 'FAILED',
    error: 'TARGET_FORBIDDEN',
    receivedAt: '2026-09-20T02:00:00.000Z',
    processedAt: null,
    replayOf: null,
    hasMessage: false,
    replayable: true,
    integrationId: '650000000000000000000001',
    workspace: { id: '650000000000000000000002', name: 'Nhóm VCI' },
    ...over,
  };
}

export function makeEventDetail(over: Partial<AdminWebhookEventDetail> = {}): AdminWebhookEventDetail {
  return {
    ...makeEvent(),
    payload: { ref: 'refs/heads/main', token: '***', pusher: { name: 'dev-a', email: '***' } },
    attempts: 2,
    message: { id: '650000000000000000000009', channel: { name: null, private: true } },
    replays: [],
    ...over,
  };
}

export function makeProvider(over: Partial<AdminProviderRow> = {}): AdminProviderRow {
  return {
    provider: 'GITHUB',
    key: 'github',
    label: 'GitHub',
    kind: 'WORKSPACE',
    configured: true,
    enabled: true,
    available: true,
    events: ['push'],
    connections: { active: 3, error: 1, revoked: 0 },
    events24h: 12,
    lastError: null,
    ...over,
  };
}

export function signIn(permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Vận hành', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

/** Dựng router bộ nhớ quanh một phần tử; trả `router` để đọc URL. */
export function renderAt(ui: ReactElement, url: string) {
  const path = url.split('?')[0];
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [url] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, ...utils };
}

export const urlParam = (router: ReturnType<typeof createMemoryRouter>, key: string) =>
  new URLSearchParams(router.state.location.search).get(key);
