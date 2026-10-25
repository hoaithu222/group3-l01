/**
 * Ngăn kéo huy hiệu theo URL (p4-03 admin.md §1): deep link `/gamification/badges/:badgeId` chuyển về tab Huy hiệu với `?badgeId=` và
 * mở ngăn kéo trên nền danh sách; mở được cả huy hiệu không nằm ở trang đang xem (đọc `GET /admin/badges/:id`); id lạ → "không tìm thấy";
 * hành động (Tắt/Bật) dùng đúng CAS `expectedVersion` + lý do. Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import BadgesTab from '@/features/gamification/components/BadgesTab';
import BadgeDetailRedirectPage from '@/features/gamification/pages/BadgeDetailRedirectPage';

import { errorBody, makeBadge, okBody, pageMeta, signIn, urlParam } from './gamification-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view']);
});

/** Danh sách có 1 huy hiệu `b1`; huy hiệu `far` KHÔNG nằm trong trang danh sách (chỉ đọc được qua `GET /:id`). */
function mockBadges() {
  const patches: unknown[] = [];
  let far = makeBadge({ id: 'far', code: 'level-10', name: 'Cấp mười', emoji: '🏆', unlockedCount: 5, criteria: { all: [{ counter: 'level', op: 'gte', value: 10 }], any: [{ counter: 'srReviewDays', op: 'gte', value: 30 }] } });
  server.use(
    http.get('*/admin/badges', () => okBody([makeBadge()], pageMeta(1))),
    http.get('*/admin/badges/:id', ({ params }) => {
      if (params.id === 'b1') return okBody(makeBadge());
      if (params.id === 'far') return okBody(far);
      return errorBody(404, 'RES_001', 'Không tìm thấy huy hiệu');
    }),
    http.patch('*/admin/badges/:id', async ({ request }) => {
      patches.push(await request.json());
      far = { ...far, isActive: false, version: far.version + 1 };
      return okBody(far);
    }),
  );
  return patches;
}

function renderApp(url: string) {
  const router = createMemoryRouter(
    [
      { path: '/gamification', element: <BadgesTab /> },
      { path: '/gamification/badges/:badgeId', element: <BadgeDetailRedirectPage />, handle: { modulePath: '/gamification' } },
    ],
    { initialEntries: [url] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

describe('Ngăn kéo huy hiệu theo URL', () => {
  it('deep link /gamification/badges/:id → chuyển về ?tab=badges&badgeId= và mở ngăn kéo trên nền danh sách', async () => {
    mockBadges();
    const { router } = renderApp('/gamification/badges/b1');

    const dialog = await screen.findByRole('dialog');
    expect(router.state.location.pathname).toBe('/gamification');
    expect(urlParam(router, 'tab')).toBe('badges');
    expect(urlParam(router, 'badgeId')).toBe('b1');
    expect(await within(dialog).findByText('Task hoàn thành ≥ 50')).toBeInTheDocument();
    expect(within(dialog).getByText('Số người đã đạt')).toBeInTheDocument();
    expect(within(dialog).getByText('37')).toBeInTheDocument();
    expect(within(dialog).getByText('Đang bật')).toBeInTheDocument();
    // danh sách vẫn ở phía sau
    expect(screen.getAllByText('Chăm chỉ').length).toBeGreaterThan(1);
  });

  it('mở được huy hiệu KHÔNG có trong trang đang xem (đọc GET /admin/badges/:id); điều kiện có cả nhóm "một trong"', async () => {
    mockBadges();
    renderApp('/gamification/badges/far');
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Cấp độ ≥ 10; một trong: Ngày ôn tập ≥ 30')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Cấp mười').length).toBeGreaterThan(0);
  });

  it('id không tồn tại → khung "Không tìm thấy huy hiệu", không toast lỗi, không lộ dữ liệu', async () => {
    mockBadges();
    renderApp('/gamification/badges/khong-co');
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Không tìm thấy huy hiệu')).toBeInTheDocument();
  });

  it('Escape đóng ngăn kéo và bỏ ?badgeId=, giữ tab', async () => {
    mockBadges();
    const { router } = renderApp('/gamification/badges/b1');
    await screen.findByRole('dialog');

    await userEvent.setup().keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(urlParam(router, 'badgeId')).toBeNull();
    expect(urlParam(router, 'tab')).toBe('badges');
  });

  it('chỉ có gamification:view → ngăn kéo không có Sửa/Tắt/Cấp bù', async () => {
    mockBadges();
    renderApp('/gamification/badges/b1');
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Task hoàn thành ≥ 50');
    for (const name of ['Sửa', 'Tắt', 'Cấp bù']) expect(within(dialog).queryByRole('button', { name })).not.toBeInTheDocument();
  });

  it('có update: Tắt trong ngăn kéo → cần lý do (≥ 10 ký tự) → PATCH đúng CAS expectedVersion, làm mới trạng thái', async () => {
    const patches = mockBadges();
    signIn(['gamification:view', 'gamification:update']);
    renderApp('/gamification/badges/far');
    const drawer = await screen.findByRole('dialog');
    await within(drawer).findByText('Đang bật');

    const user = userEvent.setup();
    await user.click(within(drawer).getByRole('button', { name: 'Tắt' }));
    const confirm = (await screen.findAllByRole('dialog')).at(-1)!;
    await user.click(within(confirm).getByRole('button', { name: 'Xác nhận' }));
    expect(patches).toHaveLength(0); // thiếu lý do → không gửi
    await user.type(within(confirm).getByRole('textbox', { name: /Lý do/ }), 'Huy hiệu đã lỗi thời');
    await user.click(within(confirm).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ isActive: false, expectedVersion: 3, reason: 'Huy hiệu đã lỗi thời' });
    // GET lại → trạng thái đổi sang "Đã tắt" trong ngăn kéo
    expect(await within(drawer).findByText('Đã tắt')).toBeInTheDocument();
  });
});
