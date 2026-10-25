/**
 * Ba thẻ đếm đầu tab "Thành viên" (p1-02 admin.md §2.1) đọc `GET /admin/workspaces/:id/access-summary`:
 * `members.{active,banned}` + `inviteLinks.active`. Chỉ SỐ LƯỢNG link mời — không token/đường dẫn.
 * Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceMemberCounts from '@/features/workspace/components/WorkspaceMemberCounts';

import { ACCESS_SUMMARY, errorBody, okBody, renderWithRouter, signIn } from './p3-fixtures';

let memberListRequests = 0;

const server = setupServer(
  // Tab Thành viên cũ đếm bằng hai truy vấn danh sách `limit=1` — nay KHÔNG được gọi `/members` chỉ để đếm.
  http.get('*/admin/workspaces/:id/members', () => {
    memberListRequests += 1;
    return okBody([], { page: 1, limit: 1, total: 0, totalPages: 1, hasNext: false, hasPrev: false });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  memberListRequests = 0;
  signIn(['workspace:view']);
});

const card = (label: string) => screen.getByText(label).parentElement as HTMLElement;
const renderCounts = () => renderWithRouter(<WorkspaceMemberCounts workspaceId="ws-1" />);

describe('WorkspaceMemberCounts', () => {
  it('hiện 3 thẻ: thành viên ACTIVE, bị chặn, link mời đang hoạt động — số lấy từ access-summary', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/access-summary', () =>
        okBody({ ...ACCESS_SUMMARY, members: { active: 12, banned: 3 }, inviteLinks: { active: 5 } }),
      ),
    );
    renderCounts();

    await waitFor(() => expect(card('Thành viên ACTIVE')).toHaveTextContent('12'));
    expect(card('Bị chặn')).toHaveTextContent('3');
    expect(card('Link mời đang hoạt động')).toHaveTextContent('5');
    expect(memberListRequests).toBe(0);
  });

  it('số 0 THẬT vẫn hiện là 0, không bị nhầm với "chưa có số liệu"', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/access-summary', () =>
        okBody({ ...ACCESS_SUMMARY, members: { active: 1, banned: 0 }, inviteLinks: { active: 0 } }),
      ),
    );
    renderCounts();

    await waitFor(() => expect(card('Bị chặn')).toHaveTextContent('0'));
    expect(card('Link mời đang hoạt động')).toHaveTextContent('0');
    expect(card('Bị chặn')).not.toHaveTextContent('—');
  });

  it('BE lỗi → cả ba thẻ là "—", KHÔNG phải 0', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/access-summary', () =>
        errorBody(500, 'SYS_500', 'Lỗi máy chủ'),
      ),
    );
    renderCounts();

    await waitFor(() => expect(card('Thành viên ACTIVE')).toHaveTextContent('—'));
    expect(card('Bị chặn')).toHaveTextContent('—');
    expect(card('Link mời đang hoạt động')).toHaveTextContent('—');
  });

  it('BE lỡ trả thừa token/đường dẫn mời → không in ra màn hình', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/access-summary', () =>
        okBody({
          ...ACCESS_SUMMARY,
          inviteLinks: { active: 2, tokens: ['tok_secret_1'], url: 'https://x/invite/tok_secret_1' },
        }),
      ),
    );
    renderCounts();

    await waitFor(() => expect(card('Link mời đang hoạt động')).toHaveTextContent('2'));
    expect(document.body.textContent).not.toContain('tok_secret_1');
    expect(document.body.textContent).not.toContain('invite/');
  });
});
