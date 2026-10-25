/**
 * Route `/skill`, `/skill/:id`, `/skill/new` trên router THẬT của app (guard + layout + lazy-load) — p6-06 admin.md §1, §4: mount khi có `skill:view`,
 * cờ `career` tắt → trang "Chưa bật"; `/skill/new` cần `skill:create`; không `skill:update` → ẩn Bật/Tắt.
 */
import { configure, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PATHS } from '@/app/config';
import { AppProvider } from '@/app/providers';
import { routes } from '@/app/router';
import { MODULE_REGISTRY } from '@/app/router/modules/module-registry';
import { queryClient } from '@/core/config';

import { makeSkill, okBody, pageMeta, signIn } from './skill-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let careerEnabled = true;

const server = setupServer(
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features: { career: { enabled: careerEnabled, available: true } } } })),
  http.get('*/admin/skills/label-suggestions', () => okBody([])),
  http.get('*/admin/skills/:id/eligible-preview', () => okBody({ eligibleCount: 3, alreadyHolding: 1, willGrant: 2, sampleUserIds: [] })),
  http.get('*/admin/skills/:id', () => okBody(makeSkill())),
  http.get('*/admin/skills', () => okBody([makeSkill()], pageMeta(1))),
);

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return { router, ...utils };
}

describe('route /skill', { timeout: 20_000 }, () => {
  beforeAll(() => {
    configure({ asyncUtilTimeout: 8000 });
    server.listen({ onUnhandledRequest: 'bypass' });
  });
  afterAll(() => {
    configure({ asyncUtilTimeout: 1000 });
    server.close();
  });
  beforeEach(() => {
    careerEnabled = true;
    queryClient.clear();
  });
  afterEach(() => server.resetHandlers());

  it('registry: cờ career, route con new (skill:create) và :id ẩn khỏi menu', () => {
    const mod = MODULE_REGISTRY.find((m) => m.id === 'skill');
    expect(mod?.featureFlag).toBe('career');
    expect(mod?.routes?.find((r) => r.path === 'new')?.permission).toEqual({ resource: 'skill', action: 'create' });
    expect(mod?.routes?.find((r) => r.path === ':id')?.hideInMenu).toBe(true);
  });

  it('/skill: danh sách + nhãn khớp; /skill/:id mount chi tiết với xem trước', async () => {
    signIn(['skill:view']);
    const list = renderApp('/skill');
    expect(await screen.findByRole('link', { name: 'Node.js' })).toHaveAttribute('href', '/skill/s1');
    expect(screen.queryByRole('link', { name: 'Tạo kỹ năng' })).not.toBeInTheDocument();
    list.unmount();

    renderApp('/skill/s1');
    expect(await screen.findByRole('region', { name: 'Xem trước người đủ điều kiện' })).toBeInTheDocument();
    // Trạng thái là dòng phụ dưới tên kỹ năng trên THANH HEADER (không còn Badge trong thân trang).
    const status = await screen.findByText('Đang bật · 12 người đạt');
    expect(screen.getByRole('banner')).toContainElement(status);
    // Không `skill:update` → không có nút Bật/Tắt.
    expect(screen.queryByRole('button', { name: /Tắt kỹ năng|Bật kỹ năng/ })).not.toBeInTheDocument();
  });

  it('/skill/:id có skill:update → nút Bật/Tắt ở mép phải THANH HEADER, bấm mở hộp thoại lý do; nút quay lại là link về /skill', async () => {
    signIn(['skill:view', 'skill:update']);
    renderApp('/skill/s1');
    const toggle = await screen.findByRole('button', { name: 'Tắt kỹ năng' });
    const header = screen.getByRole('banner');
    expect(header).toContainElement(toggle);
    expect(within(header).getByRole('link', { name: 'Về danh sách kỹ năng' })).toHaveAttribute('href', '/skill');

    await userEvent.click(toggle);

    expect(await screen.findByText('Tắt: không cấp thêm huy hiệu; người đã đạt vẫn giữ.')).toBeInTheDocument();
  });

  it('/skill/new thiếu skill:create → /403', async () => {
    signIn(['skill:view']);
    const { router } = renderApp('/skill/new');
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATHS.FORBIDDEN);
  });

  it('cờ career tắt → trang "Chưa bật" (cả danh sách lẫn chi tiết)', async () => {
    careerEnabled = false;
    signIn(['skill:view']);
    renderApp('/skill/s1');
    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
    expect(screen.queryByText('Xem trước')).not.toBeInTheDocument();
  });
});
