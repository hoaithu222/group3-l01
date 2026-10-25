/**
 * Đồ dùng chung cho bài kiểm phân hệ `skill` (p6-06 admin.md §4): fixture theo ĐÚNG hợp đồng BE (`AdminSkillDto`, `AdminUserSkillRow`,
 * `AdminProofDto`) và hàm dựng router + React Query. Không phải `*.test.*` nên vitest không chạy như bài kiểm.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type { AdminSkill, AdminUserSkillRow } from '@/features/skill/types/skill.types';

export const okBody = (data: unknown, meta?: Record<string, unknown>) => HttpResponse.json({ success: true, data, ...(meta && { meta }) });

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

export function makeSkill(over: Partial<AdminSkill> = {}): AdminSkill {
  return {
    id: 's1',
    code: 'nodejs',
    name: 'Node.js',
    description: 'API và dịch vụ phía máy chủ',
    category: 'BACKEND',
    labelMatch: ['nodejs', 'express'],
    criteria: { requiredTasksDone: 30, minStoryPoints: null, minAvgPeerScore: 7.5, requireReview: false },
    icon: 'service',
    isActive: true,
    order: 3,
    version: 4,
    holdersCount: 12,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    ...over,
  };
}

export function makeRow(over: Partial<AdminUserSkillRow> = {}): AdminUserSkillRow {
  return {
    skill: { id: 's1', code: 'nodejs', name: 'Node.js', description: null, category: 'BACKEND', icon: 'service', isActive: true, criteria: makeSkill().criteria },
    progress: { tasksDone: 31, storyPoints: 64.5, avgPeerScore: 8.2, reviewedTasks: 31, achieved: true, remaining: { tasks: 0, storyPoints: 0, peerScore: 0, reviewedTasks: 0 } },
    badge: { unlockedAt: '2026-09-12T00:00:00.000Z', revokedAt: null, revokedBy: null, revokedReason: null },
    ...over,
  };
}

export function signIn(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: { id: 'ops1', email: 'ops@congty.vn', name: 'Vận hành', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

/** Router bộ nhớ quanh một phần tử (`path` lấy từ `url`); trả `router` để đọc URL. */
export function renderAt(ui: ReactElement, url: string, extraRoutes: RouteObject[] = []) {
  const path = url.split('?')[0];
  const router = createMemoryRouter([{ path, element: ui }, ...extraRoutes], { initialEntries: [url] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, ...utils };
}
