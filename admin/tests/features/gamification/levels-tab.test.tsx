/**
 * Tab "Cấp độ" (p4-03 admin.md §2.3, §4): bảng xem trước 20 cấp khớp công thức BE `round(base × n^1.5)` (cấp n cần bấy nhiêu XP để lên cấp
 * n+1; tích luỹ = tổng các cấp trước), tính lại khi gõ; lưu cần lý do và gửi CAS `expectedVersion`; chỉ `gamification:view` → không sửa. MSW.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import LevelsTab from '@/features/gamification/components/LevelsTab';

import { okBody, renderAt, signIn } from './gamification-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'gamification:update']);
});

const CONFIG = { base: 100, maxLevel: 100, version: 4, thresholdsPreview: [] as number[] };

function mockLevels() {
  const puts: unknown[] = [];
  server.use(
    http.get('*/admin/gamification/levels', () => okBody(CONFIG)),
    http.put('*/admin/gamification/levels', async ({ request }) => {
      puts.push(await request.json());
      return okBody({ ...CONFIG, version: 5 });
    }),
  );
  return puts;
}

/** Ba ô của một dòng bảng xem trước: cấp · XP để lên cấp sau · XP tích luỹ. */
const rowCells = (level: number): string[] => {
  const row = screen.getAllByRole('row').find((r) => within(r).queryAllByRole('cell')[0]?.textContent === String(level))!;
  return within(row).getAllByRole('cell').map((c) => c.textContent ?? '');
};

describe('LevelsTab — xem trước ngưỡng cấp', () => {
  it('base 100: cấp n cần round(100 × n^1.5) XP để lên cấp sau; tích luỹ cộng dồn — 20 dòng', async () => {
    mockLevels();
    renderAt(<LevelsTab />, '/gamification?tab=levels');
    await screen.findByText(/Xem trước 20 cấp đầu/);

    // round(100·n^1.5): 100, 283, 520, 800, 1118 — cộng dồn: 0, 100, 383, 903, 1703
    expect(rowCells(1)).toEqual(['1', '100', '0']);
    expect(rowCells(2)).toEqual(['2', '283', '100']);
    expect(rowCells(3)).toEqual(['3', '520', '383']);
    expect(rowCells(4)).toEqual(['4', '800', '903']);
    expect(rowCells(5)).toEqual(['5', '1.118', '1.703']);
    expect(rowCells(20)[0]).toBe('20');
    expect(screen.getAllByRole('row')).toHaveLength(21); // 20 cấp + hàng tiêu đề
  });

  it('gõ base khác → bảng tính lại ngay; base ngoài 10–10 000 → Lưu khoá', async () => {
    mockLevels();
    renderAt(<LevelsTab />, '/gamification?tab=levels');
    await screen.findByText(/Xem trước 20 cấp đầu/);
    const base = screen.getByRole('textbox', { name: 'Hệ số base' });
    const user = userEvent.setup();

    await user.clear(base);
    await user.type(base, '200');
    expect(rowCells(2)).toEqual(['2', '566', '200']);
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled();

    await user.clear(base);
    await user.type(base, '5');
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });

  it('lưu: cần lý do; gửi { base, maxLevel, expectedVersion, reason }; nhắc "không bị hạ cấp"', async () => {
    const puts = mockLevels();
    renderAt(<LevelsTab />, '/gamification?tab=levels');
    await screen.findByText(/Xem trước 20 cấp đầu/);
    const user = userEvent.setup();
    const base = screen.getByRole('textbox', { name: 'Hệ số base' });
    await user.clear(base);
    await user.type(base, '150');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Người dùng không bị hạ cấp khi tăng base/)).toBeInTheDocument();
    expect(within(dialog).getByText('Cũ: base 100, cấp tối đa 100')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    expect(puts).toHaveLength(0);
    await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Tăng độ khó lên cấp');
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ base: 150, maxLevel: 100, expectedVersion: 4, reason: 'Tăng độ khó lên cấp' });
  });

  it('chỉ có gamification:view → không có nút Lưu, ô nhập bị khoá', async () => {
    signIn(['gamification:view']);
    mockLevels();
    renderAt(<LevelsTab />, '/gamification?tab=levels');
    await screen.findByText(/Xem trước 20 cấp đầu/);
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Hệ số base' })).toBeDisabled();
  });
});
