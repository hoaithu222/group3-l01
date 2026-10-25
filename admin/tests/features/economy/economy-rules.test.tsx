/**
 * Nhóm "Quy tắc thưởng" (p7-02 admin.md §2.1, §4): mọi nguồn XP đều có dòng (chưa có luật → tạo với `expectedVersion` 0), sửa tại dòng, lưu BẮT BUỘC lý do (thiếu → không gửi),
 * gửi đúng CAS `expectedVersion`, `RES_003` → bỏ nháp + tải lại, giá trị ngoài khoảng bị chặn ở client, thiếu `gamification:update` → chỉ xem. MSW.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import CoinRuleTable from '@/features/economy/components/CoinRuleTable';
import { COIN_SOURCE_TYPES } from '@/features/economy/constants/economy.constants';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { errorBody, makeRule, okBody, renderAt, signIn } from './economy-fixtures';

type Behaviour = 'ok' | { status: number; code: string };

let rules = [makeRule()];
let gets = 0;
let puts: Array<{ sourceType: string; body: Record<string, unknown> }> = [];
let behaviours: Behaviour[] = [];

const server = setupServer(
  http.get('*/admin/economy/rules', () => {
    gets += 1;
    return okBody(rules);
  }),
  http.patch('*/admin/economy/rules/:sourceType', async ({ request, params }) => {
    puts.push({ sourceType: String(params.sourceType), body: (await request.json()) as Record<string, unknown> });
    const next = behaviours.shift() ?? 'ok';
    if (next === 'ok') return okBody(makeRule({ version: 3 }));
    return errorBody(next.status, next.code, 'Lỗi từ BE', { currentVersion: 5 });
  }),
);

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
  server.close();
});
beforeEach(() => {
  rules = [makeRule()];
  gets = 0;
  puts = [];
  behaviours = [];
  useToastStore.setState({ toasts: [] });
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'gamification:update']);
});

const URL_RULES = '/gamification?tab=economy&section=rules';
const REASON = 'Cân bằng lại lượng xu phát ra';
const coinsBox = (label: string) => screen.getByRole('textbox', { name: `Xu mỗi lần — ${label}` });
const saveButton = (label: string) => screen.getByRole('button', { name: `Lưu luật — ${label}` });

async function setCoins(label: string, value: string) {
  const box = coinsBox(label);
  await userEvent.clear(box);
  await userEvent.type(box, value);
}

describe('CoinRuleTable — danh sách', () => {
  it('mọi nguồn XP đều có dòng; nguồn chưa có luật gắn "Chưa có luật"; luật đã có hiện xu, trần, "Phát 7 ngày"', async () => {
    renderAt(<CoinRuleTable />, URL_RULES);

    expect(await screen.findByText('Hoàn thành task')).toBeInTheDocument();
    expect(screen.getAllByText('Chưa có luật')).toHaveLength(COIN_SOURCE_TYPES.length - 1);
    expect(coinsBox('Hoàn thành task')).toHaveValue('10');
    expect(screen.getByRole('textbox', { name: 'Trần xu mỗi ngày — Hoàn thành task' })).toHaveValue('50');
    expect(screen.getByText('340')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Bật luật — Hoàn thành task' })).toBeChecked();
  });

  it('tải lỗi → "Không tải được quy tắc thưởng" + Thử lại, KHÔNG vẽ chín dòng "Chưa có luật"', async () => {
    server.use(http.get('*/admin/economy/rules', () => errorBody(500, 'SYS_001', 'Lỗi máy chủ')));
    renderAt(<CoinRuleTable />, URL_RULES);

    expect(await screen.findByText('Không tải được quy tắc thưởng')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có luật')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});

describe('CoinRuleTable — lưu luật', () => {
  it('nút Lưu chỉ bật khi có thay đổi; thiếu lý do → KHÔNG gửi; đủ lý do → PATCH đúng thân + expectedVersion, hộp thoại nêu cũ → mới', async () => {
    renderAt(<CoinRuleTable />, URL_RULES);
    await screen.findByText('Hoàn thành task');
    expect(saveButton('Hoàn thành task')).toBeDisabled();

    await setCoins('Hoàn thành task', '15');
    expect(saveButton('Hoàn thành task')).toBeEnabled();
    await userEvent.click(saveButton('Hoàn thành task'));
    const dialog = await screen.findByRole('dialog', { name: 'Lưu quy tắc thưởng' });
    expect(within(dialog).getByText('Cũ: 10 xu · trần 50/ngày · bật')).toBeInTheDocument();
    expect(within(dialog).getByText('Mới: 15 xu · trần 50/ngày · bật')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    expect(puts).toEqual([]);

    await userEvent.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      sourceType: 'TASK_COMPLETED',
      body: { coins: 15, dailyCap: 50, isActive: true, expectedVersion: 2, reason: REASON },
    });
    await waitFor(() => expect(gets).toBeGreaterThan(1)); // làm mới sau khi lưu
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('nguồn CHƯA có luật: tạo với expectedVersion 0, trần để trống = null, mặc định tắt', async () => {
    renderAt(<CoinRuleTable />, URL_RULES);
    await screen.findByText('Đạt bài kiểm tra');
    expect(saveButton('Đạt bài kiểm tra')).toBeDisabled();

    await setCoins('Đạt bài kiểm tra', '5');
    await userEvent.click(screen.getByRole('switch', { name: 'Bật luật — Đạt bài kiểm tra' }));
    await userEvent.click(saveButton('Đạt bài kiểm tra'));
    const dialog = await screen.findByRole('dialog', { name: 'Lưu quy tắc thưởng' });
    expect(within(dialog).getByText('Cũ: chưa có luật')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Thêm thưởng cho bài đạt');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      sourceType: 'QUIZ_PASSED',
      body: { coins: 5, dailyCap: null, isActive: true, expectedVersion: 0, reason: 'Thêm thưởng cho bài đạt' },
    });
  });

  it('xu = 0 (ngoài 1–1.000) → hiện lỗi ngay ở dòng và khoá nút Lưu', async () => {
    renderAt(<CoinRuleTable />, URL_RULES);
    await screen.findByText('Hoàn thành task');

    await setCoins('Hoàn thành task', '0');
    expect(await screen.findByText('Xu mỗi lần phải từ 1 đến 1.000')).toBeInTheDocument();
    expect(saveButton('Hoàn thành task')).toBeDisabled();
  });

  it('dòng chưa có luật để nguyên 0 xu thì KHÔNG hiện lỗi đỏ (chưa ai sửa gì)', async () => {
    renderAt(<CoinRuleTable />, URL_RULES);
    await screen.findByText('Đạt bài kiểm tra');
    expect(screen.queryByText('Xu mỗi lần phải từ 1 đến 1.000')).not.toBeInTheDocument();
  });

  it('RES_003 (luật vừa bị sửa ở nơi khác) → bỏ nháp, đóng hộp thoại, tải lại danh sách để lấy version mới', async () => {
    behaviours = [{ status: 409, code: 'RES_003' }];
    renderAt(<CoinRuleTable />, URL_RULES);
    await screen.findByText('Hoàn thành task');
    await setCoins('Hoàn thành task', '20');
    await userEvent.click(saveButton('Hoàn thành task'));
    const dialog = await screen.findByRole('dialog', { name: 'Lưu quy tắc thưởng' });
    const before = gets;
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    await waitFor(() => expect(gets).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(coinsBox('Hoàn thành task')).toHaveValue('10'); // nháp dựa trên bản cũ đã bị bỏ
    expect(useToastStore.getState().toasts.some((t) => /vui lòng tải lại/.test(String(t.title)))).toBe(true);
  });

  it('lỗi khác RES_003 → hộp thoại GIỮ mở để thử lại', async () => {
    behaviours = [{ status: 500, code: 'SYS_001' }];
    renderAt(<CoinRuleTable />, URL_RULES);
    await screen.findByText('Hoàn thành task');
    await setCoins('Hoàn thành task', '20');
    await userEvent.click(saveButton('Hoàn thành task'));
    const dialog = await screen.findByRole('dialog', { name: 'Lưu quy tắc thưởng' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(screen.getByRole('dialog', { name: 'Lưu quy tắc thưởng' })).toBeInTheDocument();
  });
});

describe('CoinRuleTable — quyền', () => {
  it('chỉ có gamification:view → không có nút Lưu, ô nhập và công tắc bị khoá', async () => {
    signIn(['gamification:view']);
    renderAt(<CoinRuleTable />, URL_RULES);
    await screen.findByText('Hoàn thành task');

    expect(screen.queryByRole('button', { name: /^Lưu luật/ })).not.toBeInTheDocument();
    expect(coinsBox('Hoàn thành task')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Trần xu mỗi ngày — Hoàn thành task' })).toBeDisabled();
    for (const sw of screen.getAllByRole('switch')) expect(sw).toBeDisabled();
  });
});
