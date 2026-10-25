/**
 * Tab "Kỹ năng" trong ngăn kéo người dùng (p6-06 admin.md §1, §4): chỉ hiện khi cờ `career` bật VÀ có `skill:view`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import UserDetailDrawer from '@/features/user/components/UserDetailDrawer';

import { makeRow, okBody, signIn } from './skill-fixtures';

let careerEnabled = true;

const server = setupServer(
  http.get('*/capabilities', () =>
    HttpResponse.json({
      success: true,
      data: { version: 't', features: { career: { enabled: careerEnabled, available: true } }, limits: {}, upload: { maxFileBytes: 1, allowedMime: [], signedUrlTtlSeconds: 1 } },
    }),
  ),
  http.get('*/users/:id', () =>
    okBody({ id: 'u1', email: 'an@congty.vn', name: 'Nguyễn Văn An', role: 'user', status: 'ACTIVE', emailVerified: true, createdAt: '2026-01-01T00:00:00.000Z' }),
  ),
  http.get('*/admin/users/:id/skills', () => okBody([makeRow()])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UserDetailDrawer userId="u1" onClose={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UserDetailDrawer — tab Kỹ năng', () => {
  it('cờ career bật + skill:view → có tab, mở thấy tiến độ kỹ năng', async () => {
    careerEnabled = true;
    signIn(['user:view', 'skill:view']);
    renderDrawer();
    const tab = await screen.findByRole('tab', { name: 'Kỹ năng' });
    await userEvent.setup().click(tab);
    expect(await screen.findByText('Đã đạt 12/09/2026')).toBeInTheDocument();
  });

  it('cờ career tắt → không có tab (dù có skill:view)', async () => {
    careerEnabled = false;
    signIn(['user:view', 'skill:view']);
    renderDrawer();
    expect(await screen.findByRole('tab', { name: 'Hồ sơ' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Kỹ năng' })).not.toBeInTheDocument();
  });

  it('thiếu skill:view → không có tab', async () => {
    careerEnabled = true;
    signIn(['user:view']);
    renderDrawer();
    expect(await screen.findByRole('tab', { name: 'Hồ sơ' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Kỹ năng' })).not.toBeInTheDocument();
  });
});
