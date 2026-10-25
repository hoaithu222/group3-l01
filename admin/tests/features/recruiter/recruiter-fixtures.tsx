/**
 * Đồ dùng chung cho bài kiểm phân hệ `recruiter` (VẬN HÀNH p6-08 admin.md §4): fixture theo ĐÚNG hợp đồng BE
 * (`be/src/modules/recruiter/services/{company-admin.service,recruiter.presenter}.ts`), dựng phản hồi MSW, đăng nhập giả và render kèm router + React Query.
 * Không phải `*.test.*` nên vitest không chạy như bài kiểm.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type { CompanyView } from '@/features/recruiter';
import type { AdminCompanyDetail, AdminCompanyItem } from '@/features/recruiter/types/recruiter.types';

export const COMPANY_ID = '665f1c2e8a1b2c3d4e5f6b01';
export const OWNER_ID = '665f1c2e8a1b2c3d4e5f6b02';

export const okBody = (data: unknown, meta?: Record<string, unknown>) =>
  HttpResponse.json({ success: true, data, ...(meta && { meta }) });

export const errorBody = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ success: false, error: { code, message, ...(details !== undefined && { details }) } }, { status });

export const pageMeta = (total: number, page = 1, limit = 20) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

export function makeItem(over: Partial<AdminCompanyItem> = {}): AdminCompanyItem {
  return {
    id: COMPANY_ID,
    name: 'Công ty Acme',
    website: 'https://acme.vn',
    status: 'PENDING',
    tier: 'FREE',
    createdAt: '2026-09-20T02:00:00.000Z',
    membersCount: 2,
    offersThisMonth: 3,
    quota: 5,
    reportedCount: 0,
    ...over,
  };
}

export function makeCompany(over: Partial<CompanyView> = {}): CompanyView {
  return {
    id: COMPANY_ID,
    name: 'Công ty Acme',
    website: 'https://acme.vn',
    taxCode: '0312345678',
    description: 'Phần mềm tuyển dụng',
    logoUrl: null,
    industry: 'Phần mềm',
    sizeRange: 'S11_50',
    tier: 'FREE',
    status: 'PENDING',
    statusReason: null,
    version: 4,
    createdAt: '2026-09-20T02:00:00.000Z',
    updatedAt: '2026-09-21T02:00:00.000Z',
    ...over,
  };
}

export function makeDetail(over: Partial<AdminCompanyDetail> = {}): AdminCompanyDetail {
  return {
    company: makeCompany(),
    emailDomain: 'acme.vn',
    reportedCount: 0,
    members: [
      { userId: OWNER_ID, name: 'Nguyễn Văn An', email: 'an@acme.vn', role: 'OWNER', joinedAt: '2026-09-20T02:00:00.000Z' },
      { userId: '665f1c2e8a1b2c3d4e5f6b03', name: 'Trần Thị Bình', email: 'binh@acme.vn', role: 'RECRUITER', joinedAt: '2026-09-21T02:00:00.000Z' },
    ],
    usage: [
      { period: '2026-09', used: 3 },
      { period: '2026-08', used: 5 },
    ],
    quota: 5,
    offersByStatus: { SENT: 2, READ: 1, INTERESTED: 1, DECLINED: 0, WITHDRAWN: 0, EXPIRED: 1 },
    ...over,
  };
}

/** Vai `manager` — KHÔNG phải `admin` (`admin` vượt mọi kiểm quyền chi tiết nên sẽ che lỗi phân quyền). */
export const PERM_VIEW = ['recruiter:view'];
export const PERM_APPROVE = ['recruiter:view', 'recruiter:approve'];
export const PERM_UPDATE = ['recruiter:view', 'recruiter:approve', 'recruiter:update'];

export function signInOps(permissions: string[]) {
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
