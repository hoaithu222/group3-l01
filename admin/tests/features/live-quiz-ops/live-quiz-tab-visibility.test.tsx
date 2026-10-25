/**
 * Tab `live-quiz` trong trang Gamification (p5-01 admin.md §1, §4): chỉ hiện khi cờ `live-quiz` bật (BE không công bố cờ = coi như tắt);
 * cờ tắt thì deep link `?tab=live-quiz` rơi về tab đầu và KHÔNG gọi API phiên. Registry khai tiêu đề tab, không tạo module mới.
 * Mock tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CAPABILITIES_KEY } from '@/app/capabilities';
import { gamificationModule } from '@/app/router/modules/gamification.routes';
import { MODULE_REGISTRY } from '@/app/router/modules/module-registry';
import GamificationPage from '@/features/gamification/pages/GamificationPage';

import { makeSession, okBody, pageMeta, signIn } from './live-quiz-fixtures';

let features: Record<string, { enabled: boolean; available: boolean }> = {};
let sessionCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features } })),
  http.get('*/admin/live-quiz/sessions', () => {
    sessionCalls += 1;
    return okBody([makeSession()], pageMeta(1));
  }),
  http.get('*/admin/xp-rules', () => okBody([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  features = {};
  sessionCalls = 0;
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
  it('khai tiêu đề tab "Thi đấu trực tiếp" cho `live-quiz`, KHÔNG thêm module registry mới', () => {
    expect(gamificationModule.tabTitles?.['live-quiz']).toBe('Thi đấu trực tiếp');
    expect(MODULE_REGISTRY.some((m) => m.id === 'live-quiz' || m.id === 'live-quiz-ops')).toBe(
      false,
    );
  });
});

describe('GamificationPage — tab "Thi đấu trực tiếp"', () => {
  it('cờ live-quiz bật ⇒ hiện tab; ?tab=live-quiz mount danh sách phiên', async () => {
    features = { ...flag('gamification', true), ...flag('live-quiz', true) };
    await renderPage('/gamification?tab=live-quiz');

    expect(await screen.findByRole('tab', { name: 'Thi đấu trực tiếp' })).toBeInTheDocument();
    expect(await screen.findByText('Ôn tập Giải tích 1')).toBeInTheDocument();
    expect(sessionCalls).toBeGreaterThanOrEqual(1);
  });

  it('cờ live-quiz tắt ⇒ ẩn tab, deep link rơi về tab đầu và KHÔNG gọi API phiên', async () => {
    features = { ...flag('gamification', true), ...flag('live-quiz', false) };
    await renderPage('/gamification?tab=live-quiz');

    expect(screen.queryByRole('tab', { name: 'Thi đấu trực tiếp' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Luật XP', selected: true })).toBeInTheDocument();
    expect(sessionCalls).toBe(0);
  });

  it('BE không công bố cờ live-quiz ⇒ coi như tắt', async () => {
    features = flag('gamification', true);
    await renderPage('/gamification?tab=live-quiz');

    expect(screen.queryByRole('tab', { name: 'Thi đấu trực tiếp' })).not.toBeInTheDocument();
    expect(sessionCalls).toBe(0);
  });
});
