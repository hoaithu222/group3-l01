/**
 * Đồ dùng chung cho bài kiểm khối "Chấm chéo" (p4-05 admin): fixture `GET /admin/workspaces/:id/review-stats` theo ĐÚNG
 * hình dạng BE (`ReviewStatsDto`) và hàm dựng MSW/render. Tệp `.tsx` không phải `*.test.*` nên vitest không chạy nó.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';

import { useAuthStore } from '@/app/store';
import type { ReviewStatsView } from '@/features/peer-review';

/** Đúng hình dạng BE trả — chỉ số đếm + tên bảng. */
export const REVIEW_STATS: ReviewStatsView = {
  openRounds: 4,
  pendingReviews: 7,
  overdue72h: 2,
  medianHoursToSubmit: 18.5,
  roundsInPeriod: 20,
  autoApprovedRounds: 2,
  waivedRounds: 1,
  byBoard: [
    { boardId: '64a1b2c3d4e5f60718293a01', boardName: 'Đồ án cuối kỳ', enabled: true, openRounds: 3 },
    { boardId: '64a1b2c3d4e5f60718293a02', boardName: 'Sprint cũ', enabled: false, openRounds: 0 },
  ],
};

export const okBody = (data: unknown) => HttpResponse.json({ success: true, data });

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
