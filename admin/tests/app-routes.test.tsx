/**
 * Router — mọi đường khai trong `PATHS` PHẢI mount được một route.
 *
 * Lỗi đã xảy ra thật: `PATHS.PROFILE` và `PATHS.SETTINGS` được khai và được
 * `AppHeader` điều hướng tới, nhưng KHÔNG route nào mount chúng. Bấm "Hồ sơ
 * cá nhân" trong menu người dùng rơi thẳng vào catch-all `*` và ra trang 404.
 *
 * `tsc` không thấy loại lỗi này (path là chuỗi hợp lệ), lint cũng không. Chỉ
 * có bài kiểm đối chiếu HAI DANH SÁCH mới bắt được — nên nó ở đây.
 */

import { act, configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PATHS } from '@/app/config';
import { AppProvider } from '@/app/providers';
import { routes } from '@/app/router';
import { MODULE_REGISTRY } from '@/app/router/modules/module-registry';
import {
  collectCommandActions,
  resolveAudience,
} from '@/app/router/permission/useAccessibleModules';
import { useAuthStore } from '@/app/store';
import { queryClient } from '@/core/config';
import { useCommandPaletteStore } from '@/shared/widgets/command-palette';

import { shellHandlers } from './features/auth/auth-test-utils';

// Socket giả: `@/core/socket` (thật) nói chuyện với thực thể này thay vì mở websocket ra máy chủ thật.
vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('./features/moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

/** Bỏ catch-all `*` — nó khớp mọi thứ nên giữ lại là phép kiểm luôn xanh giả. */
const CONCRETE_ROUTES = routes.filter((r) => r.path !== '*');

describe('bảng route', () => {
  it.each(Object.entries(PATHS))('PATHS.%s (%s) có route thật', (_key, path) => {
    const matched = matchRoutes(CONCRETE_ROUTES, path);

    expect(matched, `Không route nào mount "${path}"`).not.toBeNull();
    // `matchRoutes` trả mảng rỗng khi chỉ khớp route cha mà không có lá.
    expect(matched?.length ?? 0).toBeGreaterThan(0);
  });

  it('URL lạ rơi vào catch-all chứ không văng lỗi', () => {
    expect(matchRoutes(routes, '/duong-dan-khong-ton-tai')).not.toBeNull();
  });

  it('KHÔNG có path nào bị khai trùng', () => {
    const values = Object.values(PATHS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('module registry', () => {
  it('mọi module (kể cả enabled=false) có id/path duy nhất', () => {
    const ids = MODULE_REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const paths = MODULE_REGISTRY.map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each(MODULE_REGISTRY.filter((m) => m.enabled !== false))(
    'module $id mount được route',
    (m) => {
      expect(matchRoutes(CONCRETE_ROUTES, m.path)?.length ?? 0).toBeGreaterThan(0);
    },
  );

  it('resolveAudience: partner:view thắng recruiter:view', () => {
    expect(resolveAudience(['partner:view'], ['user'])).toBe('partner');
  });

  it('resolveAudience: recruiter:view + vai user thường → recruiter', () => {
    expect(resolveAudience(['recruiter:view'], ['user'])).toBe('recruiter');
  });

  it('resolveAudience: recruiter:view nhưng vai admin → vẫn ops', () => {
    expect(resolveAudience(['recruiter:view'], ['admin'])).toBe('ops');
  });

  it('resolveAudience: recruiter:view nhưng vai manager → vẫn ops', () => {
    expect(resolveAudience(['recruiter:view'], ['manager'])).toBe('ops');
  });

  it('resolveAudience: không có quyền đặc biệt → ops', () => {
    expect(resolveAudience([], ['user'])).toBe('ops');
    expect(resolveAudience(undefined, undefined)).toBe('ops');
  });
});

/**
 * Nhật ký (`/audit-log`) — trang THẬT (không còn placeholder): mount khi có quyền
 * `audit-log:view`, thiếu quyền → `/403`, và hành động ⌘K của phân hệ đi qua registry.
 *
 * Dựng router THẬT của app (guard + layout + lazy-load) thay vì render trực tiếp trang —
 * chỗ dễ hỏng nhất (quyền, registry, palette) nằm đúng ở các lớp đó.
 */
const auditServer = setupServer(
  // Request nền của shell đã đăng nhập (capabilities, overview) PHẢI có handler: jsdom mặc định ở
  // `http://localhost:3000` — đúng cổng BE dev — nên request không handler tới BE THẬT nếu máy đang
  // chạy nó; BE trả 401 cho token giả → luồng refresh/đăng xuất đá test về `/login`.
  ...shellHandlers,
  http.get('*/audit-logs', () =>
    HttpResponse.json({
      success: true,
      data: [
        {
          id: 'a1',
          actorId: '665f1c2e8a1b2c3d4e5f6a7b',
          actor: { id: '665f1c2e8a1b2c3d4e5f6a7b', name: 'Nguyễn Văn An', role: 'admin' },
          actorRole: 'unknown',
          action: 'user.lock',
          targetType: 'User',
          targetId: '665f1c2e8a1b2c3d4e5f6a7c',
          workspaceId: null,
          reason: 'Vi phạm điều khoản sử dụng',
          metadata: null,
          ip: null,
          userAgent: null,
          at: '2026-09-18T03:04:05.000Z',
        },
      ],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    }),
  ),
);

function signInWith(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  // Vai KHÔNG phải `admin` — `admin` vượt mọi kiểm quyền chi tiết nên sẽ che lỗi phân quyền.
  useAuthStore.getState().setAuth({
    user: {
      id: 'ops1',
      email: 'ops@congty.vn',
      name: 'Vận hành',
      roles: ['manager'],
      permissions,
    },
    token: 'test-token',
  });
}

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return router;
}

// Khối này dựng cả shell + lazy-load trang nên chậm hơn nhiều so với test đơn vị: khi chạy
// song song cả bộ test, ngưỡng mặc định (1s cho `findBy*`, 5s cho cả test) dễ vỡ oan.
describe('route /audit-log', { timeout: 20_000 }, () => {
  beforeAll(() => {
    configure({ asyncUtilTimeout: 8000 });
    // `error` (không phải `bypass`): request lọt handler thất bại như "BE không chạy" thay vì đập BE thật.
    auditServer.listen({ onUnhandledRequest: 'error' });
  });
  afterAll(() => {
    configure({ asyncUtilTimeout: 1000 });
    auditServer.close();
  });
  beforeEach(() => queryClient.clear());
  afterEach(() => {
    auditServer.resetHandlers();
    act(() => useCommandPaletteStore.getState().close());
  });

  it('registry: audit-log là trang thật, có subtitle và hành động ⌘K', () => {
    const mod = MODULE_REGISTRY.find((m) => m.id === 'audit-log');
    expect(mod?.subtitle).toBeTruthy();
    expect(mod?.commandPaletteActions?.map((a) => a.id)).toContain('audit-log.search-actor');
  });

  it('có audit-log:view → mount trang nhật ký, ở lại /audit-log, hiện dữ liệu', async () => {
    signInWith(['audit-log:view']);
    const router = renderApp('/audit-log');

    expect(await screen.findByPlaceholderText('ID người thực hiện')).toBeInTheDocument();
    expect(await screen.findByText('Khoá tài khoản')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/audit-log');
  });

  it('thiếu audit-log:view → chuyển sang /403, KHÔNG mount trang', async () => {
    signInWith(['user:view']);
    const router = renderApp('/audit-log');

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATHS.FORBIDDEN);
    expect(screen.queryByPlaceholderText('ID người thực hiện')).not.toBeInTheDocument();
  });

  it('⌘K có hành động "Tìm nhật ký theo người thực hiện" khi có quyền; chọn → sang trang và focus ô người thực hiện', async () => {
    signInWith(['audit-log:view']);
    const router = renderApp(PATHS.PROFILE);
    await screen.findByRole('heading', { name: 'Thông tin cá nhân' });

    act(() => useCommandPaletteStore.getState().open());
    await userEvent.click(await screen.findByText('Tìm nhật ký theo người thực hiện'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/audit-log'));
    await waitFor(() => expect(screen.getByPlaceholderText('ID người thực hiện')).toHaveFocus());
  });

  it('⌘K KHÔNG gợi ý hành động của phân hệ mà người dùng không được vào', async () => {
    signInWith(['user:view']);
    renderApp(PATHS.PROFILE);
    await screen.findByRole('heading', { name: 'Thông tin cá nhân' });

    act(() => useCommandPaletteStore.getState().open());
    await screen.findByRole('dialog');

    expect(screen.queryByText('Tìm nhật ký theo người thực hiện')).not.toBeInTheDocument();
  });
});

describe('collectCommandActions', () => {
  const modules = MODULE_REGISTRY.filter((m) => m.id === 'audit-log');

  it('gom hành động của phân hệ, kèm icon/tiêu đề phân hệ sở hữu', () => {
    const entries = collectCommandActions(modules, () => true);
    expect(entries).toEqual([
      expect.objectContaining({
        id: 'audit-log.search-actor',
        to: '/audit-log?focus=actor',
        moduleId: 'audit-log',
        moduleTitle: 'Nhật ký',
        iconName: 'history-outline',
      }),
    ]);
  });

  it('không có phân hệ nào (đã lọc hết theo quyền) → không có hành động', () => {
    expect(collectCommandActions([], () => true)).toEqual([]);
  });

  it('hành động có quyền RIÊNG chỉ hiện khi thoả quyền đó', () => {
    const withPermission = [
      {
        ...modules[0],
        commandPaletteActions: [
          {
            id: 'x.export',
            label: 'Xuất',
            to: '/x',
            permission: { resource: 'audit-log', action: 'export' as const },
          },
          { id: 'x.open', label: 'Mở', to: '/x' },
        ],
      },
    ];
    const denied = collectCommandActions(withPermission, () => false).map((a) => a.id);
    expect(denied).toEqual(['x.open']);
    const granted = collectCommandActions(
      withPermission,
      (resource, action) => resource === 'audit-log' && action === 'export',
    ).map((a) => a.id);
    expect(granted).toEqual(['x.export', 'x.open']);
  });
});
