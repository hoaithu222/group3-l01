/**
 * Tab `economy` ("Kinh tế xu") trong trang Gamification (p7-02 admin.md §1, §4): chỉ hiện khi cờ `coins` bật (BE không công bố cờ = coi như tắt); cờ tắt thì deep link
 * `?tab=economy` rơi về tab đầu và KHÔNG gọi API xu. Registry chỉ khai tiêu đề tab, không tạo module mới. Nhóm chức năng sống trên URL (`?section=`), đổi nhóm xoá bộ lọc nhóm cũ. MSW.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CAPABILITIES_KEY } from '@/app/capabilities';
import { gamificationModule } from '@/app/router/modules/gamification.routes';
import { MODULE_REGISTRY } from '@/app/router/modules/module-registry';
import { useAuthStore } from '@/app/store';
import GamificationPage from '@/features/gamification/pages/GamificationPage';

import { makeOverview, makeQuest, makeRule, okBody, signIn, urlParam } from './economy-fixtures';

let features: Record<string, { enabled: boolean; available: boolean }> = {};
let overviewCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features } })),
  http.get('*/admin/economy/overview', () => {
    overviewCalls += 1;
    return okBody(makeOverview());
  }),
  http.get('*/admin/economy/shop-items', () => okBody([])),
  http.get('*/admin/economy/rules', () => okBody([makeRule()])),
  http.get('*/admin/economy/quests', () => okBody([makeQuest()])),
  http.get('*/admin/xp-rules', () => okBody([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  features = {};
  overviewCalls = 0;
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view']);
});

const flag = (name: string, enabled: boolean) => ({ [name]: { enabled, available: true } });

/** Dựng trang trong router có `handle` giống registry thật (trang đọc `tabTitles` qua `useMatches`). */
async function renderPage(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/gamification',
        element: <GamificationPage />,
        handle: {
          modulePath: gamificationModule.path,
          tabTitles: gamificationModule.tabTitles,
          defaultTab: gamificationModule.defaultTab,
        },
      },
    ],
    { initialEntries: [url] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole('tab', { name: 'Luật XP' });
  // Chờ cờ tính năng về tới cache — thiếu bước này, "tab vắng mặt" có thể chỉ là chưa tải xong.
  await waitFor(() => expect(queryClient.getQueryData(CAPABILITIES_KEY)).toBeDefined());
  return { router };
}

describe('registry gamification', () => {
  it('khai tiêu đề tab "Kinh tế xu" cho `economy`, KHÔNG thêm module registry mới', () => {
    expect(gamificationModule.tabTitles?.economy).toBe('Kinh tế xu');
    expect(MODULE_REGISTRY.some((m) => m.id === 'economy' || m.id === 'coins')).toBe(false);
  });
});

describe('GamificationPage — tab "Kinh tế xu"', () => {
  it('cờ `coins` bật → có tab và ?tab=economy mở Tổng quan (gọi overview)', async () => {
    features = flag('coins', true);
    await renderPage('/gamification?tab=economy');

    expect(await screen.findByRole('tab', { name: 'Kinh tế xu' })).toBeInTheDocument();
    expect(await screen.findByText('Xu đang lưu hành')).toBeInTheDocument();
    expect(overviewCalls).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Ví người dùng' })).toBeInTheDocument();
  });

  it('cờ `coins` tắt → KHÔNG có tab; ?tab=economy rơi về tab đầu và KHÔNG gọi API xu', async () => {
    features = flag('coins', false);
    const { router } = await renderPage('/gamification?tab=economy');

    expect(screen.queryByRole('tab', { name: 'Kinh tế xu' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Luật XP', selected: true })).toBeInTheDocument();
    expect(screen.queryByText('Xu đang lưu hành')).not.toBeInTheDocument();
    expect(overviewCalls).toBe(0);
    expect(urlParam(router, 'tab')).toBe('economy'); // URL không bị viết lại; chỉ nội dung rơi về tab đầu
  });

  it('BE không công bố cờ `coins` (cũ) → coi như tắt', async () => {
    features = {};
    await renderPage('/gamification');
    expect(screen.queryByRole('tab', { name: 'Kinh tế xu' })).not.toBeInTheDocument();
  });
});

describe('EconomyTab — nhóm chức năng trên URL', () => {
  it('đổi nhóm ghi ?section= và xoá bộ lọc của nhóm cũ; về Tổng quan thì xoá khoá section', async () => {
    features = flag('coins', true);
    const { router } = await renderPage('/gamification?tab=economy&days=14');
    await screen.findByText('Xu đang lưu hành');

    await userEvent.click(screen.getByRole('button', { name: 'Cửa hàng' }));
    await waitFor(() => expect(urlParam(router, 'section')).toBe('shop'));
    expect(urlParam(router, 'days')).toBeNull(); // bộ lọc của Tổng quan không rơi sang nhóm mới
    expect(urlParam(router, 'tab')).toBe('economy');
    expect(await screen.findByText('Chưa có vật phẩm nào')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Quy tắc thưởng' }));
    expect(await screen.findByText('Hoàn thành task')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nhiệm vụ ngày' }));
    expect(await screen.findByText('Hoàn thành 3 task')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tổng quan' }));
    await waitFor(() => expect(urlParam(router, 'section')).toBeNull());
    expect(await screen.findByText('Xu đang lưu hành')).toBeInTheDocument();
  });

  it('?section= lạ (URL bị sửa tay) → Tổng quan', async () => {
    features = flag('coins', true);
    await renderPage('/gamification?tab=economy&section=khong-co');
    expect(await screen.findByText('Xu đang lưu hành')).toBeInTheDocument();
  });
});
