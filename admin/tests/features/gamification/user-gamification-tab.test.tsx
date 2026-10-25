/**
 * Tab "Gamification" trong ngăn kéo người dùng (p4-03 admin.md §2.5): lịch sử XP có cột Workspace (tên nhóm là liên kết khi có
 * `workspace:view`), phân trang cursor, nút ghi chỉ hiện khi có `gamification:update`. Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import UserGamificationTab from '@/features/gamification/components/UserGamificationTab';
import type { UserXpEvent } from '@/features/gamification/types/gamification.types';

import { makeOverview, okBody, renderAt, signIn } from './gamification-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'workspace:view']);
});

const event = (over: Partial<UserXpEvent> & Pick<UserXpEvent, 'id'>): UserXpEvent => ({
  sourceType: 'TASK_COMPLETED',
  xp: 10,
  capped: false,
  blockedReason: null,
  occurredAt: '2026-09-20T03:00:00.000Z',
  workspaceId: null,
  workspaceName: null,
  ...over,
});

const EVENTS: UserXpEvent[] = [
  event({ id: 'e1', workspaceId: 'ws1', workspaceName: 'Nhóm Alpha' }),
  event({ id: 'e2', sourceType: 'ADMIN_ADJUST', xp: -5 }),
  event({ id: 'e3', sourceType: 'QUIZ_SCORED', xp: 4, workspaceId: 'ws-da-xoa-123456', workspaceName: null, capped: true }),
];

const BADGE = { id: 'b1', code: 'tasks-50', name: 'Chăm chỉ', description: '', emoji: '💪', iconAssetId: null, rarity: 'COMMON' as const, unlockedAt: '2026-09-10T00:00:00.000Z', via: 'EVENT', revokedAt: null, revokeReason: null };

function mockOverview(over = {}) {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get('*/admin/users/:id/gamification', ({ request }) => {
      calls.push(new URL(request.url).searchParams);
      return okBody(makeOverview({ xpEvents: EVENTS, badges: [BADGE], ...over }));
    }),
  );
  return calls;
}

const renderTab = () => renderAt(<UserGamificationTab userId="u1" userName="An" />, '/user');

describe('UserGamificationTab — lịch sử XP có cột Workspace', () => {
  it('tên nhóm là <a href="/workspace/:id"> khi có workspace:view; sự kiện không thuộc nhóm → "—"; nhóm đã xoá → id rút gọn, không liên kết', async () => {
    mockOverview();
    renderTab();

    const link = await screen.findByRole('link', { name: 'Nhóm Alpha' });
    expect(link).toHaveAttribute('href', '/workspace/ws1');
    expect(screen.getByText('Workspace')).toBeInTheDocument(); // tiêu đề cột
    const rows = screen.getAllByRole('row');
    const adjust = rows.find((r) => within(r).queryByText('Điều chỉnh thủ công'))!;
    expect(within(adjust).getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Nhóm …123456')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /123456/ })).not.toBeInTheDocument();
  });

  it('thiếu workspace:view → tên nhóm chỉ là chữ (không dẫn tới trang bị chặn)', async () => {
    signIn(['gamification:view']);
    mockOverview();
    renderTab();
    expect(await screen.findByText('Nhóm Alpha')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nhóm Alpha' })).not.toBeInTheDocument();
  });

  it('còn trang sau → "Trang sau" gửi cursor; có trang trước → "Trang trước" quay lại', async () => {
    const calls = mockOverview({ xpEventsMeta: { nextCursor: 'CUR2', hasMore: true, limit: 20 } });
    renderTab();
    await screen.findByText('Nhóm Alpha');
    expect(screen.queryByRole('button', { name: 'Trang trước' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(calls.at(-1)!.get('cursor')).toBe('CUR2'));
    await user.click(await screen.findByRole('button', { name: 'Trang trước' }));
    await waitFor(() => expect(calls.at(-1)!.get('cursor')).toBeNull());
  });
});

describe('UserGamificationTab — quyền ghi', () => {
  it('chỉ có gamification:view → không thấy "Điều chỉnh XP" và "Thu hồi"', async () => {
    mockOverview();
    renderTab();
    await screen.findByText('Chăm chỉ');
    expect(screen.queryByRole('button', { name: 'Điều chỉnh XP' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thu hồi' })).not.toBeInTheDocument();
  });

  it('có gamification:update → thấy cả hai', async () => {
    signIn(['gamification:view', 'gamification:update']);
    mockOverview();
    renderTab();
    await screen.findByText('Chăm chỉ');
    expect(screen.getByRole('button', { name: 'Điều chỉnh XP' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thu hồi' })).toBeInTheDocument();
  });
});
