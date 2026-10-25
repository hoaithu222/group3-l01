/**
 * Tab "Xếp hạng" (p4-03 admin.md §2.4): ô chọn workspace tìm phía SERVER + "Tải thêm" (không chỉ 100 nhóm đầu), tên người dùng là liên kết
 * sang `/user/:id` khi có `user:view`, người `hidden` không bao giờ hiện dù BE lỡ trả kèm. Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import LeaderboardTab from '@/features/gamification/components/LeaderboardTab';
import type { LeaderboardEntry } from '@/features/gamification/types/gamification.types';

import { errorBody, makeEntry, okBody, pageMeta, renderAt, signIn } from './gamification-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'workspace:view', 'user:view']);
});

/** 130 nhóm "Nhóm 001…130" — vượt xa trần 100 của bản cũ. */
const WORKSPACES = Array.from({ length: 130 }, (_, i) => ({ id: `ws-${i + 1}`, name: `Nhóm ${String(i + 1).padStart(3, '0')}` }));
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase();

function mockWorkspaces() {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get('*/admin/workspaces', ({ request }) => {
      const q = new URL(request.url).searchParams;
      calls.push(q);
      const term = norm(q.get('q') ?? '');
      const all = WORKSPACES.filter((w) => norm(w.name).includes(term));
      const page = Number(q.get('page') ?? 1);
      const limit = Number(q.get('limit') ?? 20);
      return okBody(all.slice((page - 1) * limit, page * limit), pageMeta(all.length, page, limit));
    }),
  );
  return calls;
}

function mockLeaderboard(entries: LeaderboardEntry[]) {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get('*/admin/gamification/leaderboard', ({ request }) => {
      calls.push(new URL(request.url).searchParams);
      return okBody({ period: 'WEEK', from: null, to: null, entries, serverNow: '2026-09-25T00:00:00.000Z' });
    }),
  );
  return calls;
}

const openPicker = async () => {
  await userEvent.setup().click(screen.getByRole('button', { name: /Chọn workspace/ }));
  return screen.findByPlaceholderText('Tìm workspace theo tên…');
};

describe('LeaderboardTab — chọn workspace', () => {
  it('mở hộp gợi ý → trang 1 (20 nhóm, sắp theo tên); "Tải thêm" nối trang kế tới tận nhóm thứ 45 (vượt trang đầu)', async () => {
    const calls = mockWorkspaces();
    renderAt(<LeaderboardTab />, '/gamification?tab=leaderboard');
    expect(calls).toHaveLength(0); // chưa mở hộp → chưa tải
    await openPicker();

    expect(await screen.findByRole('button', { name: 'Nhóm 020' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nhóm 021' })).not.toBeInTheDocument();
    expect([calls[0]!.get('page'), calls[0]!.get('limit'), calls[0]!.get('sort'), calls[0]!.get('q')]).toEqual(['1', '20', 'name', null]);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tải thêm' }));
    expect(await screen.findByRole('button', { name: 'Nhóm 040' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tải thêm' }));
    expect(await screen.findByRole('button', { name: 'Nhóm 060' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nhóm 001' })).toBeInTheDocument(); // trang đầu vẫn còn
    expect(calls.map((c) => c.get('page'))).toEqual(['1', '2', '3']);
  });

  it('tìm theo tên gửi `q` lên server (khớp không dấu) và thay danh sách; đóng "Tải thêm" khi hết trang', async () => {
    const calls = mockWorkspaces();
    renderAt(<LeaderboardTab />, '/gamification?tab=leaderboard');
    const input = await openPicker();
    await screen.findByRole('button', { name: 'Nhóm 001' });

    await userEvent.setup().type(input, 'nhóm 12');

    await waitFor(() => expect(calls.at(-1)!.get('q')).toBe('nhóm 12'));
    expect(calls.at(-1)!.get('page')).toBe('1');
    expect(await screen.findByRole('button', { name: 'Nhóm 120' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nhóm 001' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument(); // 11 kết quả, vừa một trang
  });

  it('không có nhóm nào khớp → thông báo; lỗi tải (thiếu quyền phía BE) → thông báo, KHÔNG toast', async () => {
    mockWorkspaces();
    renderAt(<LeaderboardTab />, '/gamification?tab=leaderboard');
    const input = await openPicker();
    await userEvent.setup().type(input, 'khong-co-nhom-nay');
    expect(await screen.findByText('Không có workspace nào khớp.')).toBeInTheDocument();
  });

  it('BE trả 403 khi gợi ý → hiện "Không tải được danh sách workspace"', async () => {
    server.use(http.get('*/admin/workspaces', () => errorBody(403, 'AUTH_005', 'Không có quyền')));
    renderAt(<LeaderboardTab />, '/gamification?tab=leaderboard');
    await openPicker();
    expect(await screen.findByText(/Không tải được danh sách workspace/)).toBeInTheDocument();
  });

  it('thiếu workspace:view → chỉ hiện gợi ý quyền, KHÔNG gọi API workspace', async () => {
    signIn(['gamification:view']);
    const calls = mockWorkspaces();
    renderAt(<LeaderboardTab />, '/gamification?tab=leaderboard');
    expect(await screen.findByText('Cần quyền xem workspace để chọn nhóm xem bảng xếp hạng.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chọn workspace/ })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});

describe('LeaderboardTab — bảng hạng', () => {
  const entries = [
    makeEntry({ rank: 1, userId: 'u-1', name: 'An Nguyễn', xp: 900 }),
    makeEntry({ rank: 2, userId: 'u-2', name: 'Bình Ẩn', xp: 800, hidden: true }),
    makeEntry({ rank: 3, userId: 'u-3', name: 'Chi Lê', xp: 700 }),
  ];

  async function pickWorkspace(name: string) {
    await openPicker();
    await userEvent.setup().click(await screen.findByRole('button', { name }));
  }

  it('chọn nhóm → gọi leaderboard đúng workspaceId + kỳ; đổi kỳ gửi lại; người hidden không hiện dù BE lỡ trả', async () => {
    mockWorkspaces();
    const calls = mockLeaderboard(entries);
    renderAt(<LeaderboardTab />, '/gamification?tab=leaderboard');
    expect(await screen.findByText('Chọn một workspace để xem bảng xếp hạng')).toBeInTheDocument();

    await pickWorkspace('Nhóm 002');

    expect(await screen.findByText('An Nguyễn')).toBeInTheDocument();
    expect([calls[0]!.get('workspaceId'), calls[0]!.get('period')]).toEqual(['ws-2', 'WEEK']);
    expect(screen.getByText('Chi Lê')).toBeInTheDocument();
    expect(screen.queryByText('Bình Ẩn')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nhóm 002/ })).toBeInTheDocument(); // nút hiện nhóm đang chọn

    await userEvent.setup().click(screen.getByRole('button', { name: 'Tháng' }));
    await waitFor(() => expect(calls.at(-1)!.get('period')).toBe('MONTH'));
  });

  it('có user:view → tên là <a href="/user/:id"> thật; thiếu user:view → chỉ là chữ', async () => {
    mockWorkspaces();
    mockLeaderboard(entries);
    const first = renderAt(<LeaderboardTab />, '/gamification?tab=leaderboard');
    await pickWorkspace('Nhóm 001');
    const link = await screen.findByRole('link', { name: 'An Nguyễn' });
    expect(link).toHaveAttribute('href', '/user/u-1');
    first.unmount();

    signIn(['gamification:view', 'workspace:view']);
    renderAt(<LeaderboardTab />, '/gamification?tab=leaderboard');
    await pickWorkspace('Nhóm 001');
    expect(await screen.findByText('An Nguyễn')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'An Nguyễn' })).not.toBeInTheDocument();
  });

  it('ghi chú riêng tư luôn có dưới bảng', async () => {
    mockWorkspaces();
    mockLeaderboard(entries);
    renderAt(<LeaderboardTab />, '/gamification?tab=leaderboard');
    await pickWorkspace('Nhóm 003');
    await screen.findByText('An Nguyễn');
    expect(screen.getByText('Không hiển thị người dùng đã tắt bảng xếp hạng.')).toBeInTheDocument();
  });
});
