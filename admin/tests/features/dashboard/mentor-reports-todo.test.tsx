/**
 * `MentorReportsTodo` (p6-03 admin.md §1 Dashboard) — khối "Việc cần làm": số bài `MENTOR_POST` bị báo cáo còn OPEN, đếm
 * qua `GET /admin/reports?targetType=MENTOR_POST&status=OPEN&limit=1` (`meta.total`). Cờ `mentor` tắt / thiếu
 * `moderation:view` → không gọi API, không hiện gì; 0 → ẩn (không hiện "0 việc").
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { okJson, pageMeta, signIn } from '../moderation/moderation-fixtures';

let mentorEnabled = true;
vi.mock('@/app/capabilities', () => ({
  useFeature: (flag: string) => (flag === 'mentor' ? mentorEnabled : true),
}));

const { default: MentorReportsTodo } =
  await import('@/features/dashboard/components/MentorReportsTodo');

let calls: URLSearchParams[] = [];
let total = 2;
const server = setupServer(
  http.get('*/admin/reports', ({ request }) => {
    calls.push(new URL(request.url).searchParams);
    return okJson([], pageMeta(total, 1, 1));
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  calls = [];
  total = 2;
  mentorEnabled = true;
  signIn(['moderation:view', 'dashboard:view']);
});

function renderTodo() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<MentorReportsTodo />, { wrapper });
}

describe('MentorReportsTodo', () => {
  it('có bài bị báo cáo → hiện số + liên kết hàng đợi lọc sẵn MENTOR_POST', async () => {
    renderTodo();
    expect(
      await screen.findByText('2 bài tìm cố vấn bị báo cáo đang chờ xử lý.'),
    ).toBeInTheDocument();
    expect(calls[0].get('targetType')).toBe('MENTOR_POST');
    expect(calls[0].get('status')).toBe('OPEN');
    expect(screen.getByRole('link', { name: 'Mở hàng đợi' })).toHaveAttribute(
      'href',
      '/moderation?status=OPEN&targetType=MENTOR_POST',
    );
  });

  it('0 bài → không hiện gì', async () => {
    total = 0;
    const { container } = renderTodo();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });

  it('cờ mentor tắt hoặc thiếu moderation:view → KHÔNG gọi API', async () => {
    mentorEnabled = false;
    renderTodo();
    signIn(['dashboard:view']);
    mentorEnabled = true;
    renderTodo();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toEqual([]);
  });
});
