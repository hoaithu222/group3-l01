/**
 * Tab `features` — nhóm cờ PHỤ của tiện ích (p5-04 admin.md §2.2): `workspaceSearch`, `workspaceTemplates`, `readConfirm` hiện thành
 * bảng riêng dưới nhóm "Giao tiếp", khoá theo phân hệ cha `communication`, tắt/bật gửi đúng override kèm expectedVersion.
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
    { path: 'communication', label: 'Nhắn tin & kênh', kind: 'bool', default: true },
    { path: 'workspaceSearch', label: 'Tìm kiếm toàn nhóm', kind: 'bool', default: true },
    { path: 'workspaceTemplates', label: 'Mẫu nhóm', kind: 'bool', default: true },
    { path: 'readConfirm', label: 'Xác nhận đã đọc thông báo', kind: 'bool', default: true },
  ],
  // `readConfirm` đã bị tắt bằng ghi đè runtime.
  stored: { readConfirm: false },
  effective: { communication: true, workspaceSearch: true, workspaceTemplates: true, readConfirm: false },
  version: 4,
  updatedAt: null,
  updatedBy: null,
};

/** `communication` có mã + đang bật; cờ phụ `available` theo phân hệ cha (BE `capabilities.service.ts`). */
const capabilities = (communication: { enabled: boolean; available: boolean }) => ({
  features: {
    communication,
    workspaceSearch: { enabled: communication.enabled, available: communication.available },
    workspaceTemplates: { enabled: communication.enabled, available: communication.available },
    readConfirm: { enabled: false, available: communication.available },
  },
});

let caps = capabilities({ enabled: true, available: true });
let lastPut: PutBody | null = null;

const server = setupServer(
  http.get('*/admin/system-config', () => HttpResponse.json({ success: true, data: [FEATURES_ITEM] })),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: caps })),
  http.put('*/admin/system-config/:key', async ({ request }) => {
    lastPut = (await request.json()) as PutBody;
    return HttpResponse.json({ success: true, data: { ...FEATURES_ITEM, stored: lastPut.value, version: 5 } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderTab() {
  const router = createMemoryRouter([{ path: '/', element: <FeaturesTab /> }]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const toggle = (label: string) => screen.getByRole('switch', { name: `Bật/tắt ${label}` });

describe('FeaturesTab — cờ phụ của tiện ích', () => {
  beforeEach(() => {
    lastPut = null;
    caps = capabilities({ enabled: true, available: true });
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAuth({
      user: { id: 'me', email: 'a@x.vn', name: 'Admin', roles: ['admin'], permissions: ['system-config:view', 'system-config:update'] },
      token: 'test-token',
    });
  });

  it('hiện bảng riêng dưới nhóm "Giao tiếp": ba tiện ích, nguồn "Mặc định (bật)" hoặc "Ghi đè runtime"', async () => {
    renderTab();
    expect(await screen.findByText('Giao tiếp')).toBeInTheDocument();
    expect(screen.getByText('Tiện ích')).toBeInTheDocument();
    for (const label of ['Tìm kiếm toàn nhóm', 'Mẫu nhóm', 'Xác nhận đã đọc thông báo']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Mặc định (bật)')).toHaveLength(2);
    expect(screen.getByText('Ghi đè runtime')).toBeInTheDocument();
    // phân hệ cha vẫn ở bảng phân hệ, không lẫn vào bảng tiện ích
    expect(screen.getByText('Nhắn tin & kênh')).toBeInTheDocument();
    expect(toggle('Tìm kiếm toàn nhóm')).toBeChecked();
    expect(toggle('Xác nhận đã đọc thông báo')).not.toBeChecked();
  });

  it('tắt một cờ phụ: cảnh báo tác động riêng cho tiện ích, gửi override đủ + expectedVersion', async () => {
    renderTab();
    await screen.findByText('Tìm kiếm toàn nhóm');
    const user = userEvent.setup();
    await user.click(toggle('Tìm kiếm toàn nhóm'));

    expect(await screen.findByText('Chức năng này sẽ ẩn với người dùng; dữ liệu không bị xoá.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Lý do/), 'Tạm tắt tìm kiếm để đo tải');
    await user.click(screen.getByRole('button', { name: 'Tắt tính năng' }));

    await waitFor(() => expect(lastPut).not.toBeNull());
    expect(lastPut).toEqual({
      value: { readConfirm: false, workspaceSearch: false },
      expectedVersion: 4,
      reason: 'Tạm tắt tìm kiếm để đo tải',
    });
  });

  it('phân hệ cha đang TẮT → cờ phụ bị khoá (kèm lý do) dù có mã', async () => {
    caps = capabilities({ enabled: false, available: true });
    renderTab();
    await screen.findByText('Tìm kiếm toàn nhóm');
    for (const label of ['Tìm kiếm toàn nhóm', 'Mẫu nhóm', 'Xác nhận đã đọc thông báo']) expect(toggle(label)).toBeDisabled();
    // phân hệ cha thì vẫn bật/tắt được (đã có mã)
    expect(toggle('Nhắn tin & kênh')).toBeEnabled();
  });

  it('phân hệ cha CHƯA có mã → cờ phụ bị khoá', async () => {
    caps = capabilities({ enabled: false, available: false });
    renderTab();
    await screen.findByText('Tìm kiếm toàn nhóm');
    expect(toggle('Mẫu nhóm')).toBeDisabled();
  });

  it('chỉ có system-config:view → toggle cờ phụ bị khoá', async () => {
    useAuthStore.getState().setAuth({
      user: { id: 'me', email: 'a@x.vn', name: 'Manager', roles: ['manager'], permissions: ['system-config:view'] },
      token: 'test-token',
    });
    renderTab();
    await screen.findByText('Tìm kiếm toàn nhóm');
    expect(toggle('Tìm kiếm toàn nhóm')).toBeDisabled();
  });
});
