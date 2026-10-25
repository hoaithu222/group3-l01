/**
 * Đồ dùng chung cho bài kiểm giám sát Live Quiz (p5-01 admin.md §4): fixture theo ĐÚNG hợp đồng BE (`adminView`/`adminGet` của
 * `be/src/modules/live-quiz/services/live-quiz-query.service.ts`) và hàm dựng router + React Query. Không phải `*.test.*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type {
  AdminLiveQuizResultRow,
  AdminLiveQuizSession,
  AdminLiveQuizSessionDetail,
} from '@/features/live-quiz-ops/types/live-quiz-ops.types';

export const okBody = (data: unknown, meta?: Record<string, unknown>) =>
  HttpResponse.json({ success: true, data, ...(meta && { meta }) });

export const errorBody = (status: number, code: string, message: string) =>
  HttpResponse.json({ success: false, error: { code, message } }, { status });

export const pageMeta = (total: number, page = 1, limit = 20) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

export const SESSION_ID = '650000000000000000000a01';
export const HOST_ID = '650000000000000000000b01';
export const WORKSPACE_ID = '650000000000000000000c01';

export function makeSession(over: Partial<AdminLiveQuizSession> = {}): AdminLiveQuizSession {
  return {
    id: SESSION_ID,
    status: 'IN_PROGRESS',
    endReason: null,
    setId: '650000000000000000000d01',
    setTitle: 'Ôn tập Giải tích 1',
    workspaceId: WORKSPACE_ID,
    hostId: HOST_ID,
    total: 10,
    playersCount: 24,
    currentIndex: 2,
    autoAdvance: true,
    startedAt: '2026-09-25T02:00:00.000Z',
    endedAt: null,
    resultsPersistedAt: null,
    createdAt: '2026-09-25T01:55:00.000Z',
    version: 7,
    ...over,
  };
}

export const RESULT_ROWS: AdminLiveQuizResultRow[] = [
  {
    userId: '650000000000000000000e01',
    nickname: 'Cú đêm',
    score: 8200,
    correct: 9,
    answered: 10,
    rank: 1,
  },
  {
    userId: '650000000000000000000e02',
    nickname: null,
    score: 6100,
    correct: 7,
    answered: 10,
    rank: 2,
  },
];

export function makeDetail(
  over: Partial<AdminLiveQuizSessionDetail> = {},
): AdminLiveQuizSessionDetail {
  return { ...makeSession(), results: [], ...over };
}

/** Đăng nhập với vai KHÔNG phải `admin` (admin vượt mọi kiểm quyền chi tiết nên che lỗi phân quyền). */
export function signIn(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Vận hành', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

/** Dựng router bộ nhớ quanh một phần tử; trả `router` để đọc URL. */
export function renderAt(ui: ReactElement, url: string) {
  const path = url.split('?')[0];
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [url] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, ...utils };
}

export const urlParam = (router: ReturnType<typeof createMemoryRouter>, key: string) =>
  new URLSearchParams(router.state.location.search).get(key);
