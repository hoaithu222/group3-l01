/**
 * Tab `wellbeing` ("Sức khoẻ học tập") trong trang Gamification (p7-03 admin.md §1, §4): chỉ hiện khi cờ `burnout` bật (BE không công bố cờ = coi như tắt); cờ tắt thì deep link
 * `?tab=wellbeing` rơi về tab đầu và KHÔNG gọi API sức khoẻ. Registry chỉ khai tiêu đề tab, không tạo module mới. Nhóm chức năng sống trên URL (`?section=`). MSW.
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

import { makeOverview, makeRules, okBody, signIn, urlParam } from './wellbeing-fixtures';

let features: Record<string, { enabled: boolean; available: boolean }> = {};
let overviewCalls = 0;
let rulesCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features } })),
  http.get('*/admin/wellbeing/overview', () => {
    overviewCalls += 1;
    return okBody(makeOverview());
  }),
  http.get('*/admin/wellbeing/rules', () => {
    rulesCalls += 1;
    return okBody(makeRules());
  }),
  http.get('*/admin/xp-rules', () => okBody([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  features = {};
  overviewCalls = 0;
  rulesCalls = 0;
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
  it('khai tiêu đề tab "Sức khoẻ học tập" cho `wellbeing`, KHÔNG thêm module registry mới', () => {
    expect(gamificationModule.tabTitles?.wellbeing).toBe('Sức khoẻ học tập');
    expect(
      MODULE_REGISTRY.some(
        (m) => /wellbeing|burnout/i.test(m.id) || /wellbeing|burnout/i.test(m.path),
      ),
    ).toBe(false);
  });
});

describe('GamificationPage — tab "Sức khoẻ học tập"', () => {
  it('cờ `burnout` bật → có tab và ?tab=wellbeing mở Tổng quan ẩn danh (gọi overview, KHÔNG gọi rules)', async () => {
    features = flag('burnout', true);
    await renderPage('/gamification?tab=wellbeing');

    expect(await screen.findByRole('tab', { name: 'Sức khoẻ học tập' })).toBeInTheDocument();
    expect(await screen.findByText('Người đang bật theo dõi')).toBeInTheDocument();
    expect(screen.getByText('≈ 120')).toBeInTheDocument();
    expect(overviewCalls).toBeGreaterThan(0);
    expect(rulesCalls).toBe(0);
    expect(screen.getByRole('button', { name: 'Bộ luật đánh giá' })).toBeInTheDocument();
  });

  it('cờ `burnout` tắt → KHÔNG có tab; ?tab=wellbeing rơi về tab đầu và KHÔNG gọi API sức khoẻ', async () => {
    features = flag('burnout', false);
    const { router } = await renderPage('/gamification?tab=wellbeing');

    expect(screen.queryByRole('tab', { name: 'Sức khoẻ học tập' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Luật XP', selected: true })).toBeInTheDocument();
    expect(screen.queryByText('Người đang bật theo dõi')).not.toBeInTheDocument();
    expect(overviewCalls + rulesCalls).toBe(0);
    expect(urlParam(router, 'tab')).toBe('wellbeing'); // URL không bị viết lại; chỉ nội dung rơi về tab đầu
  });

  it('BE không công bố cờ `burnout` (cũ) → coi như tắt', async () => {
    features = {};
    await renderPage('/gamification');
    expect(screen.queryByRole('tab', { name: 'Sức khoẻ học tập' })).not.toBeInTheDocument();
  });
});

describe('WellbeingTab — nhóm chức năng trên URL', () => {
  it('đổi nhóm ghi ?section= và xoá bộ lọc của nhóm cũ; về Tổng quan thì xoá khoá section', async () => {
    features = flag('burnout', true);
    const { router } = await renderPage('/gamification?tab=wellbeing&weeks=4');
    await screen.findByText('≈ 120');

    await userEvent.click(screen.getByRole('button', { name: 'Bộ luật đánh giá' }));
    await waitFor(() => expect(urlParam(router, 'section')).toBe('rules'));
    expect(urlParam(router, 'weeks')).toBeNull(); // bộ lọc của Tổng quan không rơi sang nhóm mới
    expect(urlParam(router, 'tab')).toBe('wellbeing');
    expect(await screen.findByText('Phiên bản bộ luật')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tổng quan ẩn danh' }));
    await waitFor(() => expect(urlParam(router, 'section')).toBeNull());
    expect(await screen.findByText('Người đang bật theo dõi')).toBeInTheDocument();
  });

  it('?section= lạ (URL bị sửa tay) → Tổng quan', async () => {
    features = flag('burnout', true);
    await renderPage('/gamification?tab=wellbeing&section=khong-co');
    expect(await screen.findByText('Người đang bật theo dõi')).toBeInTheDocument();
  });
});
