/**
 * Đồ dùng chung cho các bài kiểm tab `meetings` của workspace (p2-04 admin.md §2.1, §4): fixture theo ĐÚNG hợp đồng `AdminMeetingRow`
 * (chỉ metadata) và hàm dựng MSW/render.
 *
 * Tệp `.tsx` không phải `*.test.*` nên vitest không chạy nó như bài kiểm.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import type { AdminMeetingRow } from '@/features/workspace/types/workspace-meetings.types';

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

/** Múi giờ của máy chạy test — dùng để chọn múi giờ cuộc họp "khác" hay "trùng". */
export const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const OTHER_TZ = BROWSER_TZ === 'Asia/Tokyo' ? 'America/New_York' : 'Asia/Tokyo';

export function makeMeeting(over: Partial<AdminMeetingRow> = {}): AdminMeetingRow {
  return {
    id: 'm1',
    title: 'Họp tuần sản phẩm',
    host: { id: 'u1', name: 'An Nguyễn' },
    startAt: '2026-10-05T02:00:00.000Z',
    endAt: '2026-10-05T03:00:00.000Z',
    timezone: BROWSER_TZ,
    status: 'SCHEDULED',
    platform: 'INTERNAL',
    attendeeCount: 5,
    endReason: null,
    cancelledAt: null,
    ...over,
  };
}

export const FOUR_STATUSES: AdminMeetingRow[] = [
  makeMeeting({ id: 'm-scheduled', title: 'Họp sắp tới', status: 'SCHEDULED' }),
  makeMeeting({ id: 'm-live', title: 'Họp đang diễn ra', status: 'LIVE', platform: 'ZOOM' }),
  makeMeeting({ id: 'm-ended', title: 'Họp đã xong', status: 'ENDED', endReason: 'HOST_ENDED', platform: 'TEAMS' }),
  makeMeeting({ id: 'm-cancelled', title: 'Họp đã huỷ', status: 'CANCELLED', cancelledAt: '2026-10-01T00:00:00.000Z', platform: 'GOOGLE_MEET' }),
];

export function renderTabAt(ui: ReactElement, url: string) {
  const path = url.split('?')[0];
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [url] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

export const urlParam = (router: ReturnType<typeof createMemoryRouter>, key: string): string | null =>
  new URLSearchParams(router.state.location.search).get(key);
