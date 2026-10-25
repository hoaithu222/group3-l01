/**
 * Trang đăng ký `/recruiter/signup` + định tuyến/quyền của hai phân hệ tuyển dụng (p6-08 admin.md §1, §2.8, §4), trên router THẬT của app (guard + layout + lazy-load):
 * - route độc lập NGOÀI registry: tài khoản `user` thường (chưa có quyền quản trị nào) vào được nhờ `AuthGuard allowNoAdminAccess`; các route khác vẫn chặn họ;
 * - đăng ký → `POST /companies` (không gửi trường tuỳ chọn trống), làm mới `/auth/me` để có `recruiter:view` rồi vào cổng;
 * - đã thuộc doanh nghiệp → chuyển thẳng vào cổng; tính năng chưa bật → nói rõ;
 * - audience: HR chỉ thấy `recruiter-portal`, admin chỉ thấy `recruiter`; cờ `career` tắt → cả hai ẩn; người có quyền khác truy cập cổng → /403.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PATHS } from '@/app/config';
import { MODULE_REGISTRY } from '@/app/router/modules/module-registry';
import { useAccessibleModules } from '@/app/router/permission/useAccessibleModules';
import { useAuthStore, type AuthUser } from '@/app/store';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { PLAIN_USER, renderApp, resetAuth, signIn } from '../auth/auth-test-utils';
import { cursorMeta, errorBody, HR_ID, makeMe, okBody } from './portal-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

const HR_USER: AuthUser = { id: HR_ID, email: 'hr@acme.vn', name: 'HR Acme', roles: ['user'], permissions: ['recruiter:view'] };
const REFRESHED_USER = { ...HR_USER, id: PLAIN_USER.id, role: 'user', permissions: ['recruiter:view', 'recruiter:create'] };

let careerEnabled = true;
let meState: 'none' | 'member' | 'disabled' | 'error' = 'none';
let posts: Array<Record<string, unknown>> = [];
let registerFailure: { status: number; code: string } | null = null;
let authMeHits = 0;

const server = setupServer(
  http.get('*/capabilities', () =>
    okBody({
      version: '1.0.0',
      features: { career: { enabled: careerEnabled, available: true } },
      limits: {},
      upload: { maxFileBytes: 1, allowedMime: [], signedUrlTtlSeconds: 1 },
    }),
  ),
  http.get('*/admin/overview', () => okBody({ newUsers7d: 0, activeWorkspaces: 0, openReports: 0, failedAiJobs24h: 0, activeUsersSeries: [], realtime: { socketConnections: 0, onlineUsers: 0 } })),
  http.get('*/auth/me', () => {
    authMeHits += 1;
    return okBody(REFRESHED_USER);
  }),
  http.get('*/me/company', () => {
    if (meState === 'member') return okBody(makeMe('PENDING'));
    if (meState === 'disabled') return errorBody(404, 'CFG_005', 'Tính năng chưa được bật');
    if (meState === 'error') return errorBody(500, 'SYS_001', 'lỗi');
    return errorBody(404, 'RES_001', 'Không tìm thấy doanh nghiệp');
  }),
  http.post('*/companies', async ({ request }) => {
    posts.push((await request.json()) as Record<string, unknown>);
    if (registerFailure) return errorBody(registerFailure.status, registerFailure.code, 'Doanh nghiệp với tên hoặc mã số thuế này đã được đăng ký');
    meState = 'member';
    return okBody(makeMe('PENDING'));
  }),
  http.get('*/companies/:id/talent/search', () => okBody([], cursorMeta())),
  http.get('*/skills', () => okBody([])),
  http.get('*/companies/:id/offers', () => okBody([], cursorMeta())),
  http.get('*/companies/:id/members', () => okBody([])),
  http.get('*/companies/:id/usage', () => okBody({ period: '2026-09', used: 0, quota: 5, remaining: 5, tier: 'FREE' })),
);

beforeAll(() => {
  configure({ asyncUtilTimeout: 8000 });
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
  server.close();
});
afterEach(() => server.resetHandlers());
beforeEach(() => {
  careerEnabled = true;
  meState = 'none';
  posts = [];
  registerFailure = null;
  authMeHits = 0;
  resetAuth();
});

describe('route /recruiter/signup — cho tài khoản chưa có quyền quản trị', { timeout: 30_000 }, () => {
  it('registry/PATHS: /recruiter/signup là route ngoài registry, khai trong PATHS', () => {
    expect(PATHS.RECRUITER_SIGNUP).toBe('/recruiter/signup');
    expect(MODULE_REGISTRY.some((m) => m.path === PATHS.RECRUITER_SIGNUP)).toBe(false);
  });

  it('tài khoản `user` thường (permissions rỗng) vào được trang đăng ký, KHÔNG bị chặn "chưa được cấp quyền quản trị"', async () => {
    signIn(PLAIN_USER);
    renderApp([PATHS.RECRUITER_SIGNUP]);

    expect(await screen.findByRole('heading', { name: 'Đăng ký nhà tuyển dụng' })).toBeInTheDocument();
    expect(await screen.findByLabelText(/Tên doanh nghiệp/)).toBeInTheDocument();
    expect(screen.queryByText('Tài khoản chưa được cấp quyền quản trị')).not.toBeInTheDocument();
  });

  it('cùng tài khoản đó vẫn bị chặn ở route khác (không mở lỗ hổng): /profile → "chưa được cấp quyền quản trị", có lối đăng ký nhà tuyển dụng', async () => {
    signIn(PLAIN_USER);
    renderApp([PATHS.PROFILE]);

    expect(await screen.findByText('Tài khoản chưa được cấp quyền quản trị')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng ký nhà tuyển dụng' })).toHaveAttribute('href', PATHS.RECRUITER_SIGNUP);
  });

  it('chưa đăng nhập → qua /login rồi quay lại (không lộ form cho khách)', async () => {
    resetAuth();
    const { router } = renderApp([PATHS.RECRUITER_SIGNUP]);

    await waitFor(() => expect(router.state.location.pathname).toBe(PATHS.LOGIN));
  });

  it('cờ career TẮT → trang "chưa bật", không có form', async () => {
    careerEnabled = false;
    signIn(PLAIN_USER);
    renderApp([PATHS.RECRUITER_SIGNUP]);

    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tên doanh nghiệp/)).not.toBeInTheDocument();
  });
});

describe('đăng ký doanh nghiệp', { timeout: 30_000 }, () => {
  async function fillRequired() {
    await userEvent.type(await screen.findByLabelText(/Tên doanh nghiệp/), 'Công ty Acme');
    await userEvent.type(screen.getByLabelText(/Website/), 'https://acme.vn');
  }

  it('bắt buộc tick cam kết; thiếu → báo lỗi và KHÔNG gọi API', async () => {
    signIn(PLAIN_USER);
    renderApp([PATHS.RECRUITER_SIGNUP]);
    await fillRequired();

    await userEvent.click(screen.getByRole('button', { name: 'Gửi đăng ký' }));

    expect(await screen.findByText('Bạn cần cam kết sử dụng dữ liệu ứng viên đúng mục đích')).toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  it('website không phải http(s) / MST sai → lỗi nhập; hợp lệ → POST không có trường tuỳ chọn trống; rồi "Đã gửi đăng ký, chờ duyệt", làm mới quyền và vào cổng', async () => {
    signIn(PLAIN_USER);
    const { router } = renderApp([PATHS.RECRUITER_SIGNUP]);
    await userEvent.type(await screen.findByLabelText(/Tên doanh nghiệp/), 'Công ty Acme');
    await userEvent.type(screen.getByLabelText(/Website/), 'javascript:alert(1)');
    await userEvent.type(screen.getByLabelText(/Mã số thuế/), '123');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đăng ký' }));
    expect(await screen.findByText('Website phải là địa chỉ bắt đầu bằng http:// hoặc https://')).toBeInTheDocument();
    expect(screen.getByText('Mã số thuế gồm 10 số (hoặc 10 số-3 số chi nhánh)')).toBeInTheDocument();
    expect(posts).toEqual([]);

    await userEvent.clear(screen.getByLabelText(/Website/));
    await userEvent.type(screen.getByLabelText(/Website/), 'https://acme.vn');
    await userEvent.clear(screen.getByLabelText(/Mã số thuế/));
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đăng ký' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ name: 'Công ty Acme', website: 'https://acme.vn' });
    expect(await screen.findByText('Đã gửi đăng ký, chờ duyệt')).toBeInTheDocument();
    // Quyền mới (recruiter:view) đã được làm mới NGAY — không chờ cache 60 s.
    expect(authMeHits).toBeGreaterThan(0);
    expect(useAuthStore.getState().user?.permissions).toContain('recruiter:view');
    // Ở lại màn "chờ duyệt" — KHÔNG tự chuyển vào cổng giữa chừng.
    expect(router.state.location.pathname).toBe(PATHS.RECRUITER_SIGNUP);

    await userEvent.click(screen.getByRole('button', { name: 'Vào cổng nhà tuyển dụng' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/recruiter/portal'));
    expect(await screen.findByText('Doanh nghiệp đang chờ duyệt')).toBeInTheDocument();
  });

  it('RECR_004 (trùng tên/MST) → ở lại form, giữ nguyên nội dung để sửa', async () => {
    registerFailure = { status: 409, code: 'RECR_004' };
    signIn(PLAIN_USER);
    renderApp([PATHS.RECRUITER_SIGNUP]);
    await fillRequired();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đăng ký' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(screen.queryByText('Đã gửi đăng ký, chờ duyệt')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Tên doanh nghiệp/)).toHaveValue('Công ty Acme');
    await waitFor(() => expect(useToastStore.getState().toasts.length).toBeGreaterThan(0));
  });

  it('ĐÃ thuộc doanh nghiệp → làm mới quyền rồi chuyển THẲNG vào cổng, không hiện form', async () => {
    meState = 'member';
    signIn(PLAIN_USER);
    const { router } = renderApp([PATHS.RECRUITER_SIGNUP]);

    await waitFor(() => expect(router.state.location.pathname).toBe('/recruiter/portal'));
    expect(authMeHits).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/Tên doanh nghiệp/)).not.toBeInTheDocument();
  });

  it('BE báo tính năng chưa bật (404 CFG_005) → nói rõ, không form', async () => {
    meState = 'disabled';
    signIn(PLAIN_USER);
    renderApp([PATHS.RECRUITER_SIGNUP]);

    expect(await screen.findByText('Chưa mở đăng ký nhà tuyển dụng')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tên doanh nghiệp/)).not.toBeInTheDocument();
  });

  it('kiểm tra tài khoản lỗi tạm thời (5xx) → Callout "Thử lại", KHÔNG hiện form như thể chưa có doanh nghiệp', async () => {
    meState = 'error';
    signIn(PLAIN_USER);
    renderApp([PATHS.RECRUITER_SIGNUP]);

    expect(await screen.findByText('Không kiểm tra được tài khoản của bạn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tên doanh nghiệp/)).not.toBeInTheDocument();
  });
});

describe('quyền & audience của hai phân hệ', { timeout: 30_000 }, () => {
  it('registry: recruiter (ops) và recruiter-portal (audience recruiter) cùng cờ career; deep link con ẩn khỏi menu', () => {
    const ops = MODULE_REGISTRY.find((m) => m.id === 'recruiter');
    const portal = MODULE_REGISTRY.find((m) => m.id === 'recruiter-portal');
    expect(ops?.featureFlag).toBe('career');
    expect(portal?.featureFlag).toBe('career');
    expect(portal?.audience).toBe('recruiter');
    expect(ops?.audience ?? 'ops').toBe('ops');
    expect(ops?.routes?.find((r) => r.path === 'companies/:id')?.hideInMenu).toBe(true);
    expect(portal?.routes?.map((r) => r.path)).toEqual(['talent/:userId', 'offers/:id']);
  });

  it('người dùng có quyền khác nhưng KHÔNG có recruiter:view truy cập /recruiter/portal → /403', async () => {
    signIn({ id: 'u5', email: 'a@b.vn', name: 'An', roles: ['manager'], permissions: ['user:view'] });
    const { router } = renderApp(['/recruiter/portal']);

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATHS.FORBIDDEN);
  });

  it('HR (quyền theo dữ liệu, không role admin/manager) mở /recruiter/portal được', async () => {
    meState = 'member';
    signIn(HR_USER);
    const { router } = renderApp(['/recruiter/portal']);

    expect(await screen.findByText('Doanh nghiệp đang chờ duyệt')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recruiter/portal');
  });

  it('cờ career TẮT → cổng HR hiện trang "chưa bật"', async () => {
    careerEnabled = false;
    signIn(HR_USER);
    renderApp(['/recruiter/portal']);

    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
  });

  describe('menu theo audience', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
    );
    const idsFor = async (user: AuthUser) => {
      useAuthStore.getState().clearAuth();
      useAuthStore.getState().setAuth({ user, token: 'test-token' });
      const { result } = renderHook(() => useAccessibleModules(), { wrapper });
      await waitFor(() => expect(result.current.length).toBeGreaterThan(0));
      return result;
    };

    it('HR chỉ thấy recruiter-portal (không thấy recruiter vận hành)', async () => {
      const result = await idsFor(HR_USER);
      await waitFor(() => expect(result.current.map((m) => m.id)).toEqual(['recruiter-portal']));
    });

    it('admin thấy recruiter (vận hành) và KHÔNG thấy recruiter-portal', async () => {
      const result = await idsFor({ id: 'a1', email: 'a@b.vn', name: 'Admin', roles: ['admin'], permissions: [] });
      await waitFor(() => expect(result.current.map((m) => m.id)).toContain('recruiter'));
      expect(result.current.map((m) => m.id)).not.toContain('recruiter-portal');
    });

    it('cờ career TẮT → cả hai module ẩn', async () => {
      careerEnabled = false;
      const hr = await idsFor(HR_USER);
      await waitFor(() => expect(hr.current.map((m) => m.id)).not.toContain('recruiter-portal'));
      const admin = await idsFor({ id: 'a1', email: 'a@b.vn', name: 'Admin', roles: ['admin'], permissions: [] });
      await waitFor(() => expect(admin.current.map((m) => m.id)).not.toContain('recruiter'));
    });
  });
});
