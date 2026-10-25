/**
 * Tab "Sự kiện webhook" (p5-03 admin.md §2.1/§4): bộ lọc sống trên URL và đi thẳng vào request; ngăn kéo hiện payload ĐÃ CHE (không có
 * token/secret/ciphertext), kênh riêng tư không lộ tên; "Phát lại" chỉ khi có `integration:update` VÀ sự kiện FAILED/IGNORED. Mock tầng HTTP (MSW).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import WebhookEventsTab from '@/features/integration/components/WebhookEventsTab';

import {
  EVENT_ID,
  makeEvent,
  makeEventDetail,
  okBody,
  pageMeta,
  renderAt,
  signIn,
  urlParam,
} from './integration-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['integration:view']);
});

function mockList() {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get('*/admin/integrations/events', ({ request }) => {
      calls.push(new URL(request.url).searchParams);
      return okBody([makeEvent()], pageMeta(1));
    }),
  );
  return calls;
}

function mockDetail(detail = makeEventDetail()) {
  server.use(http.get(`*/admin/integrations/events/${EVENT_ID}`, () => okBody(detail)));
}

describe('WebhookEventsTab — bộ lọc trên URL', () => {
  it('provider/status/ngày trên URL đi vào request; "Xoá bộ lọc" bỏ hết và về trang 1', async () => {
    const calls = mockList();
    const { router } = renderAt(
      <WebhookEventsTab />,
      '/integration?tab=events&provider=GITHUB&status=FAILED&from=2026-09-01&to=2026-09-20&page=2',
    );
    await screen.findByText('dev-a đã push 3 commit lên main (vci/app)');
    const q = calls[0]!;
    expect(q.get('provider')).toBe('GITHUB');
    expect(q.get('status')).toBe('FAILED');
    expect(q.get('limit')).toBe('50');
    expect(q.get('page')).toBe('2');
    expect(q.get('from')).toMatch(/^2026-0[89]-\d\dT/);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    await waitFor(() => expect(urlParam(router, 'provider')).toBeNull());
    expect(urlParam(router, 'status')).toBeNull();
    expect(urlParam(router, 'tab')).toBe('events');
    await waitFor(() => expect(calls.at(-1)!.get('provider')).toBeNull());
  });

  it('giá trị URL lạ bị bỏ, không gửi BE', async () => {
    const calls = mockList();
    renderAt(<WebhookEventsTab />, '/integration?tab=events&provider=EVIL&status=x');
    await screen.findByText('Lỗi');
    expect(calls[0]!.get('provider')).toBeNull();
    expect(calls[0]!.get('status')).toBeNull();
  });
});

describe('WebhookEventDrawer', () => {
  it('payload đã che + kênh riêng tư không lộ tên; không có nút Phát lại khi thiếu integration:update', async () => {
    mockList();
    mockDetail();
    renderAt(<WebhookEventsTab />, `/integration?tab=events&eventId=${EVENT_ID}`);
    expect(await screen.findByText('delivery-1')).toBeInTheDocument();
    expect(screen.getByText(/kênh riêng tư/)).toBeInTheDocument();
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/ciphertext|ghp_|@example|secret-value/);
    expect(body).toContain('***');
    expect(screen.queryByRole('button', { name: 'Phát lại' })).not.toBeInTheDocument();
  });

  it('có integration:update: sự kiện PROCESSED không phát lại được; FAILED → lý do → POST replay', async () => {
    signIn(['integration:view', 'integration:update']);
    mockList();
    mockDetail(makeEventDetail({ status: 'PROCESSED' }));
    const first = renderAt(<WebhookEventsTab />, `/integration?tab=events&eventId=${EVENT_ID}`);
    await screen.findByText('delivery-1');
    expect(screen.queryByRole('button', { name: 'Phát lại' })).not.toBeInTheDocument();
    first.unmount();

    mockDetail(makeEventDetail({ status: 'FAILED' }));
    let posted: unknown = null;
    server.use(
      http.post(`*/admin/integrations/events/${EVENT_ID}/replay`, async ({ request }) => {
        posted = await request.json();
        return okBody(makeEvent({ id: '650000000000000000000abd', status: 'RECEIVED' }));
      }),
    );
    renderAt(<WebhookEventsTab />, `/integration?tab=events&eventId=${EVENT_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Phát lại' }));
    await user.type(screen.getByLabelText(/Lý do/), 'Kênh đã được cấp lại quyền, phát lại');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(posted).toEqual({ reason: 'Kênh đã được cấp lại quyền, phát lại' }));
  });
});
