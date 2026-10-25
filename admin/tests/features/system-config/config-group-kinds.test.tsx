/**
 * `ConfigGroupList` với ô KHÔNG phải số: bật/tắt (`limits.guest.enabledByDefault`) và
 * chọn enum (`notification.defaults`, p0-06 admin.md §2.1). Khoá chỉ có field `json`
 * hoặc không có field nào bị bỏ qua thay vì hiện thẻ rỗng.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import ConfigGroupList from '@/features/system-config/components/ConfigGroupList';
import type { ConfigTabId } from '@/features/system-config/types/system-config.types';

interface PutBody {
  value: Record<string, unknown>;
  expectedVersion: number;
  reason: string;
}

const base = { stored: {}, version: 2, updatedAt: null, updatedBy: null };

const GUEST = {
  ...base,
  key: 'limits.guest',
  tab: 'limits',
  label: 'Khách mời',
  fields: [
    {
      path: 'enabledByDefault',
      label: 'Bật mời khách mặc định cho nhóm mới',
      kind: 'bool',
      default: false,
    },
    {
      path: 'defaultDays',
      label: 'Số ngày mặc định',
      kind: 'int',
      default: 30,
      floor: 1,
      ceil: 90,
      unit: 'days',
    },
  ],
  effective: { enabledByDefault: false, defaultDays: 30 },
};

const NOTI_DEFAULTS = {
  ...base,
  key: 'notification.defaults',
  tab: 'notifications',
  label: 'Mặc định thông báo',
  fields: [
    {
      path: 'directMode',
      label: 'Tin nhắn 1-1',
      kind: 'enum',
      default: 'MENTIONS_AND_THREADS',
      options: ['ALL', 'MENTIONS_AND_THREADS', 'MUTED'],
    },
    { path: 'sound', label: 'Âm thanh trong ứng dụng', kind: 'bool', default: true },
  ],
  effective: { directMode: 'MENTIONS_AND_THREADS', sound: true },
};

// Khung tab không có field nào (`notifications`) và khoá chỉ có `json` (`pm`) — không có gì để sửa.
const EMPTY_NOTI = {
  ...base,
  key: 'notifications',
  tab: 'notifications',
  label: 'Thông báo',
  fields: [],
  effective: {},
};
const JSON_ONLY = {
  ...base,
  key: 'pm',
  tab: 'pm',
  label: 'Dự án',
  fields: [{ path: 'defaultColumns', label: 'Cột mặc định', kind: 'json', default: [] }],
  effective: { defaultColumns: [] },
};

let lastPut: PutBody | null = null;

const server = setupServer(
  http.get('*/admin/system-config', () =>
    HttpResponse.json({ success: true, data: [GUEST, NOTI_DEFAULTS, EMPTY_NOTI, JSON_ONLY] }),
  ),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features: {} } })),
  http.put('*/admin/system-config/:key', async ({ request, params }) => {
    lastPut = (await request.json()) as PutBody;
    const src = params.key === 'notification.defaults' ? NOTI_DEFAULTS : GUEST;
    return HttpResponse.json({
      success: true,
      data: { ...src, stored: lastPut.value, version: src.version + 1 },
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

function renderList(tab: ConfigTabId, tabLabel: string, hideWhenEmpty = false) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <ConfigGroupList hideWhenEmpty={hideWhenEmpty} tab={tab} tabLabel={tabLabel} />,
    },
  ]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('ConfigGroupList — ô bật/tắt và chọn', () => {
  beforeEach(() => {
    lastPut = null;
    useAuthStore.getState().clearAuth();
  });

  it('limits.guest: ô bật/tắt hiện cùng ô số; bật rồi lưu → chỉ ô khác mặc định vào override', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderList('limits', 'giới hạn');
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: /Bật mời khách mặc định/ });
    expect(screen.getByText(/Mặc định: Tắt/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Số ngày mặc định/)).toBeInTheDocument();

    await user.click(toggle);
    expect(await screen.findByText('Đã tuỳ chỉnh')).toBeInTheDocument();
    // Mỗi ô có nút "Về mặc định" RIÊNG kèm tên ô — nhiều hàng mà nút cùng tên "Về mặc định" thì trình đọc màn hình không phân biệt được.
    expect(
      screen.getByRole('button', { name: 'Về mặc định — Bật mời khách mặc định cho nhóm mới' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lưu nhóm' }));
    await user.type(await screen.findByLabelText(/Lý do/), 'Mở mời khách cho đợt thử');
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => expect(lastPut).not.toBeNull());
    expect(lastPut).toMatchObject({
      value: { enabledByDefault: true },
      expectedVersion: 2,
      reason: 'Mở mời khách cho đợt thử',
    });
  });

  it('notification.defaults: hiện nhãn tiếng Việt cho enum và ô âm thanh; bỏ khoá rỗng/chỉ-json', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderList('notifications', 'thông báo', true);

    expect(await screen.findByText('Mặc định thông báo')).toBeInTheDocument();
    expect(screen.getByText(/Mặc định: Nhắc tên và luồng trả lời/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Âm thanh trong ứng dụng/ })).toBeChecked();
    // Khoá `notifications` (khung, không field) không thành thẻ.
    expect(screen.queryByText('Thông báo')).not.toBeInTheDocument();
  });

  it('tab chỉ có khoá json + hideWhenEmpty → không hiện gì (không thẻ rỗng, không EmptyState)', async () => {
    signIn(['system-config:view', 'system-config:update']);
    const { container } = renderList('pm', 'dự án', true);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByText('Dự án')).not.toBeInTheDocument();
    expect(screen.queryByText('Chưa có cấu hình')).not.toBeInTheDocument();
    expect(container.querySelector('button')).toBeNull();
  });

  it('chỉ có system-config:view → ô bật/tắt bị khoá, không nút lưu', async () => {
    signIn(['system-config:view']);
    renderList('limits', 'giới hạn');

    // Form chỉ-đọc (`readOnly`) hiện giá trị dạng chữ thay vì công tắc — không có gì để bấm.
    expect(await screen.findByText('Khách mời')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Lưu nhóm' })).toHaveLength(0);
    expect(
      screen.queryAllByRole('switch').filter((s) => !(s as HTMLButtonElement).disabled),
    ).toHaveLength(0);
  });
});
