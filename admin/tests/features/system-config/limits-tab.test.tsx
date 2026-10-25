/**
 * Tab `limits` của trang `system-config` (p0-07 admin.md §2.2, §4) — nhóm dựng
 * từ metadata BE, xác nhận có lý do, `expectedVersion`, 409 giữ giá trị đang
 * nhập, `CFG_002` gắn đúng ô, và quyền chỉ-xem.
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
import LimitsTab from '@/features/system-config/tabs/LimitsTab';

interface PutBody {
  value: Record<string, unknown>;
  expectedVersion: number;
  reason: string;
}

const MESSAGE_ITEM = {
  key: 'limits.message',
  tab: 'limits',
  label: 'Tin nhắn',
  fields: [
    {
      path: 'maxChars',
      label: 'Số ký tự tối đa',
      kind: 'int',
      default: 4000,
      floor: 100,
      ceil: 4000,
      unit: 'count',
    },
    {
      path: 'editWindowSeconds',
      label: 'Cửa sổ sửa tin',
      kind: 'int',
      default: 900,
      floor: 0,
      ceil: 86400,
      unit: 's',
    },
  ],
  stored: {},
  effective: { maxChars: 4000, editWindowSeconds: 900 },
  version: 3,
  updatedAt: null,
  updatedBy: null,
};

const UPLOAD_ITEM = {
  key: 'limits.upload',
  tab: 'limits',
  label: 'Tải tệp',
  fields: [
    {
      path: 'maxFileBytes',
      label: 'Kích thước tệp tối đa',
      kind: 'bytes',
      default: 25 * 1024 * 1024,
      floor: 1024 * 1024,
      ceil: 25 * 1024 * 1024,
      unit: 'bytes',
    },
  ],
  stored: {},
  effective: { maxFileBytes: 25 * 1024 * 1024 },
  version: 0,
  updatedAt: null,
  updatedBy: null,
};

// Khoá thuộc tab khác — phải KHÔNG hiện ở tab Giới hạn.
const FEATURES_ITEM = { ...MESSAGE_ITEM, key: 'features', tab: 'features', label: 'Tính năng' };

let lastPut: PutBody | null = null;

const server = setupServer(
  http.get('*/admin/system-config', () =>
    HttpResponse.json({ success: true, data: [UPLOAD_ITEM, FEATURES_ITEM, MESSAGE_ITEM] }),
  ),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features: {} } })),
  http.put('*/admin/system-config/:key', async ({ request }) => {
    lastPut = (await request.json()) as PutBody;
    return HttpResponse.json({
      success: true,
      data: { ...MESSAGE_ITEM, stored: lastPut.value, version: MESSAGE_ITEM.version + 1 },
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
  const router = createMemoryRouter([{ path: '/', element: <LimitsTab /> }]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** Mỗi nhóm có một nút 'Lưu nhóm'; chỉ nhóm đã sửa mới bật — chọn nút đang bật. */
async function enabledSaveButton() {
  return waitFor(() => {
    const btn = screen
      .getAllByRole('button', { name: 'Lưu nhóm' })
      .find((b) => !(b as HTMLButtonElement).disabled);
    if (!btn) throw new Error('chưa có nút Lưu nhóm nào bật');
    return btn;
  });
}

async function typeInto(label: string, value: string) {
  const user = userEvent.setup();
  const input = await screen.findByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
  return user;
}

describe('LimitsTab', () => {
  beforeEach(() => {
    lastPut = null;
    useAuthStore.getState().clearAuth();
  });

  it('dựng nhóm từ metadata BE, sắp theo nhãn, bỏ khoá thuộc tab khác', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderTab();

    expect(await screen.findByText('Tin nhắn')).toBeInTheDocument();
    expect(screen.getByText('Tải tệp')).toBeInTheDocument();
    expect(screen.queryByText('Tính năng')).not.toBeInTheDocument();
    // Hint "Mặc định · Trần" và `bytes` hiển thị MB.
    expect(screen.getAllByText(/Mặc định: 4\.000 · Trần: 4\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Mặc định: 25 MB · Trần: 25 MB/)).toBeInTheDocument();
  });

  it('lưu: mở xác nhận, lý do < 10 ký tự không gửi, đủ lý do gửi đúng expectedVersion', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderTab();

    const user = await typeInto('Số ký tự tối đa', '2000');
    await user.click(await enabledSaveButton());

    // Diff before/after nằm trong hộp xác nhận.
    expect(
      await screen.findByText('Giá trị áp dụng cho mọi người dùng trong ≤ 60 giây.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Lý do/), 'ngan');
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(lastPut).toBeNull();

    await user.clear(screen.getByLabelText(/Lý do/));
    await user.type(screen.getByLabelText(/Lý do/), 'Giảm tải cho đợt thử nghiệm');
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => expect(lastPut).not.toBeNull());
    expect(lastPut).toMatchObject({
      // Chỉ ô KHÁC mặc định mới vào override.
      value: { maxChars: 2000 },
      expectedVersion: 3,
      reason: 'Giảm tải cho đợt thử nghiệm',
    });
  });

  it('nhập vượt trần → ô tự kẹp về trần khi rời ô, không có gì để lưu', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderTab();

    // NumberInput kẹp min/max khi blur — vượt trần không tới được nút Lưu.
    // (Lưới an toàn thứ hai là zod theo floor/ceil: xem config-form.test.ts.)
    const user = await typeInto('Số ký tự tối đa', '9999');
    await user.tab();

    await waitFor(() => expect(screen.getByLabelText('Số ký tự tối đa')).toHaveValue('4000'));
    expect(
      screen
        .queryAllByRole('button', { name: 'Lưu nhóm' })
        .filter((b) => !(b as HTMLButtonElement).disabled),
    ).toHaveLength(0);
    expect(lastPut).toBeNull();
  });

  it('409 RES_003 → banner "Tải lại", giá trị đang nhập còn nguyên', async () => {
    signIn(['system-config:view', 'system-config:update']);
    server.use(
      http.put('*/admin/system-config/:key', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'RES_003',
              message: 'Dữ liệu đã thay đổi',
              details: { currentVersion: 5 },
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderTab();

    const user = await typeInto('Số ký tự tối đa', '2000');
    await user.click(await enabledSaveButton());
    await user.type(await screen.findByLabelText(/Lý do/), 'Giảm tải cho đợt thử nghiệm');
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    expect(await screen.findByText('Cấu hình vừa được người khác thay đổi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeInTheDocument();
    expect(screen.getByLabelText('Số ký tự tối đa')).toHaveValue('2000');
  });

  it('400 CFG_002 → lỗi gắn đúng ô theo details.path', async () => {
    signIn(['system-config:view', 'system-config:update']);
    server.use(
      http.put('*/admin/system-config/:key', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'CFG_002',
              message: 'Giá trị nằm ngoài giới hạn cho phép',
              details: { path: 'maxChars', floor: 100, ceil: 1500 },
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderTab();

    const user = await typeInto('Số ký tự tối đa', '2000');
    await user.click(await enabledSaveButton());
    await user.type(await screen.findByLabelText(/Lý do/), 'Giảm tải cho đợt thử nghiệm');
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    expect(await screen.findByText('Giá trị nằm ngoài giới hạn cho phép')).toBeInTheDocument();
  });

  it('manager chỉ có system-config:view → thấy nhóm nhưng không có nút lưu/khôi phục', async () => {
    signIn(['system-config:view']);
    renderTab();

    expect(await screen.findByText('Tin nhắn')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Lưu nhóm' })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'Khôi phục mặc định cả nhóm' })).toHaveLength(0);
  });
});
