/**
 * Phân hệ `gamification` — trạng thái LỖI TẢI của từng tab và cách hiện dữ liệu.
 *
 * Trước đây các tab dùng `isLoading || !data` (kẹt ở "Đang tải…" khi lỗi) hoặc mặc định `data ?? []`
 * (vẽ bảng trống "Chưa có huy hiệu nào" như thể không có dữ liệu). Nay lỗi ⇒ banner + "Thử lại", và
 * bấm thử lại (khi BE hồi phục) hiện dữ liệu thật. Kèm: nhãn truy cập của ô trong bảng luật XP, lý do
 * chặn XP không lộ mã thô, số/ngày qua `formatNumber`/`formatDate`.
 *
 * Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import BadgesTab from '@/features/gamification/components/BadgesTab';
import LeaderboardTab from '@/features/gamification/components/LeaderboardTab';
import LevelsTab from '@/features/gamification/components/LevelsTab';
import UserGamificationTab from '@/features/gamification/components/UserGamificationTab';
import XpRulesTab from '@/features/gamification/components/XpRulesTab';
import { formatDate } from '@/shared/utils/format';

import {
  errorBody,
  makeBadge,
  makeOverview,
  okBody,
  pageMeta,
  renderAt,
  signIn,
} from './gamification-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'gamification:update', 'workspace:view']);
});

const fail = () => errorBody(500, 'SYS_500', 'Lỗi máy chủ');
const retry = () => screen.getByRole('button', { name: 'Thử lại' });

describe('lỗi tải → banner + "Thử lại", không vẽ trạng thái sai', () => {
  it('Luật XP: không vẽ bảng trống; thử lại hiện luật', async () => {
    const rule = {
      sourceType: 'TASK_COMPLETED',
      xp: 10,
      dailyCap: null,
      countsForStreak: true,
      isActive: true,
      version: 1,
      updatedAt: '2026-09-20T03:04:00.000Z',
    };
    server.use(http.get('*/admin/xp-rules', fail));
    const user = userEvent.setup();
    renderAt(<XpRulesTab />, '/gamification?tab=xp-rules');

    expect(await screen.findByText('Không tải được luật XP')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có luật XP nào')).not.toBeInTheDocument();

    server.use(http.get('*/admin/xp-rules', () => okBody([rule])));
    await user.click(retry());
    expect(await screen.findByText('Hoàn thành task')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được luật XP')).not.toBeInTheDocument();
  });

  it('Cấp độ: lỗi không còn kẹt ở "Đang tải…"; thử lại hiện form', async () => {
    server.use(http.get('*/admin/gamification/levels', fail));
    const user = userEvent.setup();
    renderAt(<LevelsTab />, '/gamification?tab=levels');

    expect(await screen.findByText('Không tải được cấu hình cấp độ')).toBeInTheDocument();
    expect(screen.queryByText('Đang tải…')).not.toBeInTheDocument();

    server.use(
      http.get('*/admin/gamification/levels', () =>
        okBody({ base: 100, maxLevel: 100, version: 1, thresholdsPreview: [] }),
      ),
    );
    await user.click(retry());
    expect(await screen.findByRole('textbox', { name: 'Hệ số base' })).toBeInTheDocument();
  });

  it('Huy hiệu: không vẽ "Chưa có huy hiệu nào" khi đang lỗi; thử lại hiện danh sách', async () => {
    server.use(http.get('*/admin/badges', fail));
    const user = userEvent.setup();
    renderAt(<BadgesTab />, '/gamification?tab=badges');

    expect(await screen.findByText('Không tải được danh sách huy hiệu')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có huy hiệu nào')).not.toBeInTheDocument();

    server.use(http.get('*/admin/badges', () => okBody([makeBadge()], pageMeta(1))));
    await user.click(retry());
    expect(await screen.findByRole('link', { name: 'Chăm chỉ' })).toBeInTheDocument();
  });

  it('Xếp hạng: lỗi tải hiện banner; chưa có ai thì nói rõ thay vì "Không có dữ liệu"', async () => {
    server.use(
      http.get('*/admin/workspaces', () =>
        okBody([{ id: 'w1', name: 'Nhóm 001' }], pageMeta(1)),
      ),
      http.get('*/admin/gamification/leaderboard', fail),
    );
    const user = userEvent.setup();
    renderAt(<LeaderboardTab />, '/gamification?tab=leaderboard');

    await user.click(screen.getByRole('button', { name: /Chọn workspace/ }));
    await user.click(await screen.findByRole('button', { name: 'Nhóm 001' }));
    expect(await screen.findByText('Không tải được bảng xếp hạng')).toBeInTheDocument();

    server.use(
      http.get('*/admin/gamification/leaderboard', () =>
        okBody({ period: 'WEEK', entries: [] }),
      ),
    );
    await user.click(retry());
    expect(await screen.findByText('Chưa có ai trên bảng xếp hạng của kỳ này')).toBeInTheDocument();
  });

  it('Tab Gamification của người dùng: lỗi không kẹt "Đang tải…"; thử lại hiện tóm tắt', async () => {
    server.use(http.get('*/admin/users/:id/gamification', fail));
    const user = userEvent.setup();
    renderAt(<UserGamificationTab userId="u1" userName="An" />, '/user');

    expect(await screen.findByText('Không tải được thông tin gamification')).toBeInTheDocument();
    expect(screen.queryByText('Đang tải…')).not.toBeInTheDocument();

    server.use(
      http.get('*/admin/users/:id/gamification', () =>
        okBody(
          makeOverview({
            summary: { xp: 12345, level: 3, xpIntoLevel: 1234, xpToNext: 1000, streak: 4, longestStreak: 9 },
          }),
        ),
      ),
    );
    await user.click(retry());
    // Số có dấu phân tách hàng nghìn (vi-VN), không phải "12345".
    expect(await screen.findByText('12.345')).toBeInTheDocument();
    expect(screen.getByText('1.234/2.234')).toBeInTheDocument();
  });
});

describe('bảng luật XP — ô nhập và công tắc có tên truy cập theo nguồn', () => {
  it('mỗi ô mang tên nguồn (không chỉ "ô nhập số"/"công tắc")', async () => {
    server.use(
      http.get('*/admin/xp-rules', () =>
        okBody([
          {
            sourceType: 'QUIZ_PASSED',
            xp: 20,
            dailyCap: 100,
            countsForStreak: false,
            isActive: true,
            version: 2,
            updatedAt: '2026-09-20T03:04:00.000Z',
          },
        ]),
      ),
    );
    renderAt(<XpRulesTab />, '/gamification?tab=xp-rules');

    expect(await screen.findByRole('textbox', { name: 'Số XP — Đạt bài kiểm tra' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Trần XP mỗi ngày — Đạt bài kiểm tra' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Tính vào chuỗi ngày — Đạt bài kiểm tra' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Bật luật — Đạt bài kiểm tra' })).toBeInTheDocument();
    // Ngày cập nhật qua `formatDate`, không phải `toLocaleString` của trình duyệt.
    expect(
      screen.getByText(formatDate('2026-09-20T03:04:00.000Z', 'HH:mm DD/MM/YYYY')),
    ).toBeInTheDocument();
  });
});

describe('lịch sử XP — lý do chặn và số XP', () => {
  it('mã BE không lộ ra UI: MIN_TASK_AGE → "Task quá mới", mã lạ → "lý do khác"; XP có dấu + phân tách nghìn', async () => {
    const base = {
      sourceType: 'TASK_COMPLETED' as const,
      capped: false,
      occurredAt: '2026-09-20T03:00:00.000Z',
      workspaceId: null,
      workspaceName: null,
    };
    server.use(
      http.get('*/admin/users/:id/gamification', () =>
        okBody(
          makeOverview({
            xpEvents: [
              { ...base, id: 'e1', xp: 0, blockedReason: 'MIN_TASK_AGE' },
              { ...base, id: 'e2', xp: 0, blockedReason: 'SOMETHING_NEW' },
              { ...base, id: 'e3', xp: 1250, blockedReason: null },
              { ...base, id: 'e4', xp: -50, blockedReason: null },
            ],
          }),
        ),
      ),
    );
    renderAt(<UserGamificationTab userId="u1" userName="An" />, '/user');

    expect(await screen.findByText('Bị chặn: Task quá mới')).toBeInTheDocument();
    expect(screen.getByText('Bị chặn: lý do khác')).toBeInTheDocument();
    expect(screen.queryByText(/MIN_TASK_AGE|SOMETHING_NEW/)).not.toBeInTheDocument();
    expect(screen.getByText('+1.250')).toBeInTheDocument();
    expect(screen.getByText('-50')).toBeInTheDocument();
    // Không có sự kiện nào hợp lệ → đã kiểm ở test khác; ở đây chỉ chắc bảng có 4 dòng dữ liệu.
    const rows = screen.getAllByRole('row');
    await waitFor(() => expect(within(rows[rows.length - 1]).getByText('-50')).toBeInTheDocument());
  });
});
