/**
 * Tab "Luật XP" (p4-03 admin.md §2.1, §4): lưu một dòng cần LÝ DO (thiếu → không gửi), gửi đúng CAS `expectedVersion`; `RES_003` (luật vừa bị
 * sửa nơi khác) → tải lại danh sách; chỉ `gamification:view` → không sửa được, không có nút Lưu; POMODORO_CYCLE "Chưa hỗ trợ". MSW.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import XpRulesTab from '@/features/gamification/components/XpRulesTab';
import type { XpRule } from '@/features/gamification/types/gamification.types';

import { errorBody, okBody, renderAt, signIn } from './gamification-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'gamification:update']);
});

const rule = (over: Partial<XpRule>): XpRule => ({
  id: 'r1',
  sourceType: 'TASK_COMPLETED',
  xp: 10,
  dailyCap: 100,
  countsForStreak: false,
  isActive: true,
  version: 2,
  updatedBy: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});
const RULES = [rule({}), rule({ id: 'r2', sourceType: 'POMODORO_CYCLE', xp: 0, dailyCap: null, isActive: false, version: 1 })];

function mockRules(put: (body: unknown) => Response | Promise<Response>) {
  const state = { gets: 0, puts: [] as unknown[] };
  server.use(
    http.get('*/admin/xp-rules', () => {
      state.gets += 1;
      return okBody(RULES);
    }),
    http.put('*/admin/xp-rules/:sourceType', async ({ request }) => {
      const body = await request.json();
      state.puts.push(body);
      return put(body);
    }),
  );
  return state;
}

const rowOf = async (label: string) => (await screen.findByText(label)).closest('tr')!;

async function editXp(value: string) {
  const row = await rowOf('Hoàn thành task');
  const xp = within(row).getAllByRole('textbox')[0]!;
  const user = userEvent.setup();
  await user.clear(xp);
  await user.type(xp, value);
  await user.click(within(row).getByRole('button', { name: 'Lưu' }));
  return { user, dialog: await screen.findByRole('dialog') };
}

describe('XpRulesTab — lưu luật', () => {
  it('nút Lưu chỉ bật khi có thay đổi; xác nhận thiếu lý do → KHÔNG gửi; đủ lý do → PUT đúng thân + expectedVersion, tác động hiện cũ → mới', async () => {
    const state = mockRules(() => okBody(rule({ xp: 15, version: 3 })));
    renderAt(<XpRulesTab />, '/gamification?tab=xp-rules');
    const row = await rowOf('Hoàn thành task');
    expect(within(row).getByRole('button', { name: 'Lưu' })).toBeDisabled();

    const { user, dialog } = await editXp('15');
    expect(within(dialog).getByText(/Cũ: 10 XP/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Mới: 15 XP/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    expect(state.puts).toHaveLength(0);
    await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Cân bằng lại điểm thưởng');
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(state.puts).toHaveLength(1));
    expect(state.puts[0]).toEqual({ xp: 15, dailyCap: 100, countsForStreak: false, isActive: true, expectedVersion: 2, reason: 'Cân bằng lại điểm thưởng' });
    await waitFor(() => expect(state.gets).toBeGreaterThan(1)); // làm mới sau khi lưu
  });

  it('RES_003 (luật vừa bị sửa ở nơi khác) → tải lại danh sách để lấy version mới', async () => {
    const state = mockRules(() => errorBody(409, 'RES_003', 'Luật đã được sửa ở nơi khác'));
    renderAt(<XpRulesTab />, '/gamification?tab=xp-rules');
    const { user, dialog } = await editXp('20');
    await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Tăng điểm thưởng task');
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(state.puts).toHaveLength(1));
    await waitFor(() => expect(state.gets).toBeGreaterThan(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // lỗi → hộp thoại giữ mở để thử lại sau khi thấy dữ liệu mới
  });

  it('POMODORO_CYCLE hiện "Chưa hỗ trợ", không có công tắc Bật', async () => {
    mockRules(() => okBody({}));
    renderAt(<XpRulesTab />, '/gamification?tab=xp-rules');
    const row = await rowOf('Chu kỳ Pomodoro');
    expect(within(row).getByText('Chưa hỗ trợ', { selector: 'span.text-caption-12' })).toBeInTheDocument();
    expect(within(row).getAllByRole('switch')).toHaveLength(1); // chỉ "Tính chuỗi ngày"
  });
});

describe('XpRulesTab — quyền', () => {
  it('chỉ có gamification:view → không có nút Lưu, ô nhập và công tắc bị khoá', async () => {
    signIn(['gamification:view']);
    mockRules(() => okBody({}));
    renderAt(<XpRulesTab />, '/gamification?tab=xp-rules');
    const row = await rowOf('Hoàn thành task');
    expect(within(row).queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    for (const box of within(row).getAllByRole('textbox')) expect(box).toBeDisabled();
    for (const sw of within(row).getAllByRole('switch')) expect(sw).toBeDisabled();
  });
});
