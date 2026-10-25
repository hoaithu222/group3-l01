/**
 * Đồ dùng chung cho bài kiểm cổng HR `recruiter-portal` (p6-08 admin.md §4): fixture theo ĐÚNG hợp đồng BE
 * (`be/src/modules/recruiter/services/{recruiter.presenter,talent-search.service}.ts`), dựng phản hồi MSW, đăng nhập giả (HR = tài khoản `user` thường có quyền THEO DỮ LIỆU)
 * và render kèm router + React Query. Không phải `*.test.*` nên vitest không chạy như bài kiểm.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type { CompanyStatus } from '@/features/recruiter';
import type { OfferDetail, OfferItem } from '@/features/recruiter-portal/types/offer.types';
import type { CompanyScopeAction, MyCompany } from '@/features/recruiter-portal/types/portal.types';
import type { TalentCard, TalentProfile } from '@/features/recruiter-portal/types/talent.types';

import { makeCompany } from '../recruiter/recruiter-fixtures';

export { errorBody, okBody } from '../recruiter/recruiter-fixtures';

export const COMPANY_ID = '665f1c2e8a1b2c3d4e5f6b01';
export const HR_ID = '665f1c2e8a1b2c3d4e5f6d01';
export const STUDENT_ID = '665f1c2e8a1b2c3d4e5f6d02';
export const OFFER_ID = '665f1c2e8a1b2c3d4e5f6d03';

/** Quyền theo DỮ LIỆU của HR (BE `dataPermissionsFor`): xem ở mọi trạng thái, tạo/sửa chỉ khi công ty APPROVED (+ OWNER cho update). */
export const HR_PERMISSIONS = ['recruiter:view', 'recruiter:create', 'recruiter:update'];

export function signInHr(permissions: string[] = HR_PERMISSIONS) {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: { id: HR_ID, email: 'hr@acme.vn', name: 'HR Acme', roles: ['user'], permissions },
    token: 'test-token',
  });
}

/** `GET /me/company` — quyền phạm vi công ty theo `companyActionsFor` của BE. */
export function makeMe(status: CompanyStatus = 'APPROVED', role: 'OWNER' | 'RECRUITER' = 'OWNER', reason: string | null = null): MyCompany {
  const permissions: CompanyScopeAction[] = ['company.view'];
  if (role === 'OWNER') permissions.push('company.manage');
  if (status === 'APPROVED') permissions.push('company.talent', 'company.offer');
  return {
    company: makeCompany({ status, statusReason: reason, version: 7 }),
    membership: { role, status: 'ACTIVE', joinedAt: '2026-09-20T02:00:00.000Z' },
    permissions,
  };
}

export function makeTalent(over: Partial<TalentCard> = {}): TalentCard {
  return {
    userId: STUDENT_ID,
    displayName: 'Lê Minh Châu',
    avatarUrl: null,
    headline: 'Sinh viên năm 4 — Frontend',
    preferredRoles: ['Frontend'],
    location: 'Hà Nội',
    skills: [
      { skillId: 's1', code: 'reactjs', name: 'React', icon: 'code' },
      { skillId: 's2', code: 'nodejs', name: 'Node.js', icon: 'service' },
    ],
    badgeCount: 2,
    contributionPct: 42.5,
    contributionWorkspaces: 3,
    portfolioUrl: 'https://chau.dev',
    ...over,
  };
}

export function makeProfile(over: Partial<TalentProfile> = {}): TalentProfile {
  return {
    card: makeTalent(),
    badges: [
      { skillId: 's1', code: 'reactjs', name: 'React', icon: 'code', category: 'FRONTEND', unlockedAt: '2026-08-01T00:00:00.000Z', proof: { tasksDone: 31, storyPoints: 64.5, avgPeerScore: 8.2 } },
    ],
    openOffer: null,
    ...over,
  };
}

export function makeOfferItem(over: Partial<OfferItem> = {}): OfferItem {
  return {
    id: OFFER_ID,
    student: { userId: STUDENT_ID, displayName: 'Lê Minh Châu', avatarUrl: null },
    recruiter: { userId: HR_ID, name: 'HR Acme' },
    title: 'Thực tập Frontend',
    employmentType: 'INTERNSHIP',
    status: 'SENT',
    declineReason: null,
    threadLocked: false,
    sentAt: '2026-09-20T03:00:00.000Z',
    readAt: null,
    respondedAt: null,
    expiresAt: '2026-10-20T03:00:00.000Z',
    unreadMessages: 0,
    ...over,
  };
}

export function makeOfferDetail(over: Partial<OfferDetail> = {}): OfferDetail {
  return {
    ...makeOfferItem(),
    message: 'Chào bạn,\nChúng tôi muốn mời bạn thực tập tại Acme.',
    location: 'Hà Nội',
    jdUrl: null,
    sharedEmail: null,
    threadOpen: false,
    ...over,
  };
}

export const cursorMeta = (nextCursor: string | null = null) => ({ nextCursor, hasMore: nextCursor !== null, limit: 20 });

/** Router bộ nhớ quanh một phần tử; trả `router` để đọc URL. */
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
