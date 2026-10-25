import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { MentorPostDetail } from '../api/mentor.types';

/** Đồ dùng chung cho test của `mentor`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.tsx`). */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(
  ui: ReactElement,
  queryClient: QueryClient = makeQueryClient(),
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  const result = await render(ui, { wrapper: Wrapper });
  return { ...result, queryClient };
}

/** Lỗi axios có cấu trúc `{ error: { code, details } }` như BE trả. */
export function apiError(status: number, code: string, details?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { data: { error: { code, details, message: code } }, headers: {}, status },
  });
}

export function makePostDetail(over: Partial<MentorPostDetail> = {}): MentorPostDetail {
  return {
    activeEngagements: 0,
    applicantsCount: 2,
    closedAt: null,
    commitmentHoursPerWeek: 3,
    createdAt: '2026-09-20T00:00:00.000Z',
    createdBy: { id: 'u-owner', name: 'Chủ nhóm' },
    description: 'Nhóm cần người review kiến trúc backend.',
    expiresAt: '2026-10-20T00:00:00.000Z',
    hidden: false,
    id: 'post-1',
    mentorsNeeded: 1,
    myActions: { apply: true, manage: false, report: true, withdraw: false },
    myApplication: null,
    skillLabels: ['Node.js', 'MongoDB'],
    status: 'OPEN',
    title: 'Cần cố vấn kiến trúc backend',
    version: 1,
    workspace: { avatarUrl: null, id: 'ws-1', name: 'Nhóm đồ án' },
    ...over,
  };
}
