/**
 * Đồ dùng chung cho các bài kiểm phân hệ `moderation` (p1-08): fixture theo ĐÚNG shape BE thật
 * (`be/src/modules/moderation/services/{admin-report-presenter,platform-moderation.service}.ts`),
 * hàm dựng phản hồi MSW, đăng nhập giả và hàm render kèm router + React Query.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type {
  AdminReportGroup,
  ModerationMessage,
  PrivateContent,
  ReportDetail,
} from '@/features/moderation/types/moderation.types';

export const REPORT_ID = '665f1c2e8a1b2c3d4e5f6a01';
export const WORKSPACE_ID = '665f1c2e8a1b2c3d4e5f6a02';
export const AUTHOR_ID = '665f1c2e8a1b2c3d4e5f6a03';

export const PERM_VIEW = ['moderation:view'];
export const PERM_MODERATE = ['moderation:view', 'moderation:update', 'moderation:approve'];
export const PERM_MODERATE_LOCK = [...PERM_MODERATE, 'user:update'];

const NOW = '2026-09-19T03:00:00.000Z';

export function makeGroup(overrides: Partial<AdminReportGroup> = {}): AdminReportGroup {
  return {
    reportId: REPORT_ID,
    groupKey: `MESSAGE:m-${overrides.reportId ?? REPORT_ID}`,
    targetType: 'MESSAGE',
    targetId: 'm-1',
    reportCount: 3,
    reasons: ['SPAM'],
    workspace: { id: WORKSPACE_ID, name: 'Nhóm Alpha' },
    scope: { type: 'CHANNEL', isPrivate: false, name: 'general' },
    targetAuthor: { id: AUTHOR_ID, name: 'Nguyễn Văn An' },
    firstAt: '2026-09-18T01:00:00.000Z',
    latestAt: NOW,
    status: 'OPEN',
    resolution: null,
    handlerLevel: 'SCOPE',
    ...overrides,
  };
}

export function makeMessage(overrides: Partial<ModerationMessage> = {}): ModerationMessage {
  return {
    id: 'm-1',
    seq: 10,
    authorId: AUTHOR_ID,
    authorName: 'Nguyễn Văn An',
    kind: 'USER',
    content: 'Nội dung tin bị báo cáo',
    attachments: [],
    createdAt: NOW,
    editedAt: null,
    deleted: false,
    deletedAt: null,
    isTarget: true,
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<ReportDetail> = {}): ReportDetail {
  return {
    group: makeGroup(),
    reports: [
      {
        id: REPORT_ID,
        reporter: { id: 'r-1', name: 'Trần Thị Bình' },
        reason: 'SPAM',
        description: 'Quảng cáo liên tục',
        status: 'OPEN',
        createdAt: NOW,
      },
    ],
    publicContent: [
      makeMessage({ id: 'm-0', seq: 9, isTarget: false, content: 'Tin ngữ cảnh trước' }),
      makeMessage(),
    ],
    history: [
      {
        id: 'h-1',
        groupKey: 'USER:u-9',
        targetType: 'USER',
        reason: 'HARASSMENT',
        status: 'RESOLVED',
        resolution: 'AUTHOR_WARNED',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    authorStats: { reports30d: 4, removed30d: 2 },
    ...overrides,
  };
}

/** Tin trong phạm vi RIÊNG TƯ — không có `publicContent`, nhóm có `scope.isPrivate`. */
export function makePrivateDetail(overrides: Partial<AdminReportGroup> = {}): ReportDetail {
  const group = makeGroup({
    workspace: { id: WORKSPACE_ID, name: 'Nhóm Alpha' },
    scope: { type: 'CONVERSATION', isPrivate: true },
    ...overrides,
  });
  const detail = makeDetail({ group });
  delete detail.publicContent;
  return detail;
}

export function makePrivateContent(overrides: Partial<PrivateContent> = {}): PrivateContent {
  return {
    messages: [
      makeMessage({ id: 'p-0', seq: 9, isTarget: false, content: 'Tin riêng tư trước' }),
      makeMessage({ id: 'p-1', content: 'Tin riêng tư bị báo cáo' }),
      makeMessage({
        id: 'p-2',
        seq: 11,
        isTarget: false,
        content: null,
        deleted: true,
        deletedAt: NOW,
      }),
    ],
    scope: { type: 'CONVERSATION', id: 'c-1' },
    viewedAt: NOW,
    accessExpiresAt: null,
    ...overrides,
  };
}

export const okJson = (data: unknown, meta?: unknown) =>
  HttpResponse.json({ success: true, data, ...(meta === undefined ? {} : { meta }) });

export const pageMeta = (total: number, page = 1, limit = 20) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

export const errorJson = (status: number, code: string, message: string) =>
  HttpResponse.json({ success: false, error: { code, message } }, { status });

/** Vai KHÔNG phải `admin` — `admin` vượt mọi kiểm quyền chi tiết nên sẽ che lỗi phân quyền. */
export function signIn(permissions: string[], roles: string[] = ['manager']) {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'mod@congty.vn', name: 'Kiểm duyệt', roles, permissions },
    token: 'test-token',
  });
}

type InitialEntries = NonNullable<
  NonNullable<Parameters<typeof createMemoryRouter>[1]>['initialEntries']
>;

export function renderRoutes(routes: RouteObject[], initialEntries: InitialEntries) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient };
}
