/**
 * Đồ dùng chung cho bài kiểm tab `resources` / `projects` / khách-lời mời của workspace (Phase 3 —
 * p3-01, p3-02, p3-04): fixture theo ĐÚNG hợp đồng trong `admin.md` của từng module và hàm dựng MSW.
 *
 * Tệp `.tsx` không phải `*.test.*` nên vitest không chạy nó như bài kiểm.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type { AccessSummaryView } from '@/features/workspace/types/workspace-access.types';
import type { ContributionStatsView } from '@/features/workspace/types/workspace-contribution.types';
import type { ProjectStatsView } from '@/features/workspace/types/workspace-projects.types';
import type { ResourceStatsView } from '@/features/workspace/types/workspace-resources.types';

export const GIB = 1024 ** 3;

export const RESOURCE_STATS: ResourceStatsView = {
  usedBytes: 1.5 * GIB,
  quotaBytes: 2 * GIB,
  quotaSource: 'DEFAULT',
  fileCount: 128,
  folderCount: 14,
  trashBytes: 200 * 1024 * 1024,
  byType: [
    { type: 'PDF', count: 40, bytes: 900 * 1024 * 1024 },
    { type: 'IMAGE', count: 70, bytes: 400 * 1024 * 1024 },
    { type: 'CODE', count: 18, bytes: 2 * 1024 * 1024 },
  ],
};

export const PROJECT_STATS: ProjectStatsView = {
  boards: [
    {
      id: '64a1b2c3d4e5f60718293a01',
      name: 'Đồ án cuối kỳ',
      archived: false,
      columnCount: 4,
      byKind: { TODO: 5, IN_PROGRESS: 3, REVIEW: 2, DONE: 9 },
      updatedAt: '2026-09-10T08:30:00.000Z',
    },
    {
      id: '64a1b2c3d4e5f60718293a02',
      name: 'Sprint cũ',
      archived: true,
      columnCount: 3,
      byKind: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 12 },
      updatedAt: '2026-08-01T08:30:00.000Z',
    },
  ],
  // Đúng như BE trả: `boards` = số bảng ĐANG DÙNG, `archivedBoards` riêng (UI đếm từ danh sách bảng).
  totals: { boards: 1, archivedBoards: 1, tasks: 31, done30d: 14, overdue: 4 },
  doneByWeek: [
    { weekStart: '2026-08-03T00:00:00.000Z', count: 3 },
    { weekStart: '2026-08-10T00:00:00.000Z', count: 5 },
    { weekStart: '2026-08-17T00:00:00.000Z', count: 0 },
    { weekStart: '2026-08-24T00:00:00.000Z', count: 6 },
  ],
};

/** Đúng hình dạng `GET /admin/workspaces/:id/contribution-stats` (p4-06) — chỉ số đếm, không dữ liệu thành viên. */
export const CONTRIBUTION_STATS: ContributionStatsView = {
  boardsWithCustomWeights: 3,
  exports: { ready: 12, failed: 1 },
  lastComputedAt: '2026-09-25T06:30:00.000Z',
  staleBoards: 0,
  pendingBoards: 2,
};

export const ACCESS_SUMMARY: AccessSummaryView = {
  joinPolicy: 'APPROVAL',
  guestPolicy: { enabled: true, maxGuests: 20, maxDays: 90 },
  members: { active: 4, banned: 1 },
  inviteLinks: { active: 2 },
  guests: { active: 3, expiringIn48h: 1 },
  pendingRequests: 2,
  pendingInvitations: 5,
  privateChannels: { total: 6, withRoleGrant: 2 },
};

export const okBody = (data: unknown, meta?: Record<string, unknown>) =>
  HttpResponse.json({ success: true, data, ...(meta ? { meta } : {}) });

export const errorBody = (status: number, code: string, message: string) =>
  HttpResponse.json({ success: false, error: { code, message } }, { status });

/** Đăng nhập với vai KHÔNG phải `admin` (admin vượt mọi kiểm quyền chi tiết nên che lỗi phân quyền). */
export function signIn(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Quản lý', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** Như `renderWithQuery` nhưng có router (cần cho `Link` và tham số URL `useQueryParams`). */
export function renderWithRouter(ui: ReactElement, url = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [url] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
