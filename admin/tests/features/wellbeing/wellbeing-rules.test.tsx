/**
 * Nhóm "Bộ luật đánh giá" (p7-03 admin.md §2.2, §4): xem bộ luật hiện hành; sửa CHỈ khi có `gamification:update`; form chặn `Cao ≤ Trung bình` và luật nhìn xa hơn cửa sổ ở client (không gửi);
 * lưu BẮT BUỘC lý do và gửi đúng thân PUT + `expectedVersion`; `RES_003` → đóng form, tải lại, toast; lỗi khác giữ form mở; nhật ký `wellbeing.rules-update` hiện bên dưới. MSW.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import BurnoutRulesPanel from '@/features/wellbeing/components/BurnoutRulesPanel';
import type { BurnoutRules } from '@/features/wellbeing/types/wellbeing.types';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { errorBody, makeRules, okBody, renderAt, signIn } from './wellbeing-fixtures';

type Behaviour = 'ok' | { status: number; code: string; message?: string; details?: unknown };

let rules: BurnoutRules = makeRules();
let gets = 0;
let puts: Array<Record<string, unknown>> = [];
let behaviours: Behaviour[] = [];
let auditQueries: URLSearchParams[] = [];

const server = setupServer(
  http.get('*/admin/wellbeing/rules', () => {
    gets += 1;
    return okBody(rules);
  }),
  http.put('*/admin/wellbeing/rules', async ({ request }) => {
    puts.push((await request.json()) as Record<string, unknown>);
    const next = behaviours.shift() ?? 'ok';
    if (next === 'ok') return okBody(makeRules({ version: rules.version + 1 }));
    return errorBody(
      next.status,
      next.code,
      next.message ?? 'Lỗi từ BE',
      next.details ?? { currentVersion: 9 },
    );
  }),
  http.get('*/audit-logs', ({ request }) => {
    auditQueries.push(new URL(request.url).searchParams);
    return okBody([], { nextCursor: null, hasMore: false, limit: 20 });
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
  rules = makeRules();
  gets = 0;
  puts = [];
  behaviours = [];
  auditQueries = [];
  useToastStore.setState({ toasts: [] });
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'gamification:update']);
});

const URL_RULES = '/gamification?tab=wellbeing&section=rules';
const REASON = 'Nới ngưỡng theo phản hồi sinh viên';
const DIALOG = 'Sửa bộ luật đánh giá';

async function openEditor() {
  const { queryClient } = renderAt(<BurnoutRulesPanel />, URL_RULES);
  await screen.findByText('Làm việc liên tục quá lâu');
  await userEvent.click(screen.getByRole('button', { name: 'Sửa bộ luật' }));
  return { dialog: await screen.findByRole('dialog', { name: DIALOG }), queryClient };
}

async function setNumber(scope: HTMLElement, name: RegExp | string, value: string) {
  const box = within(scope).getByRole('textbox', { name });
  await userEvent.clear(box);
  await userEvent.type(box, value);
}

async function save(dialog: HTMLElement, reason = REASON) {
  await userEvent.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), reason);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu bộ luật' }));
}

describe('BurnoutRulesPanel — xem', () => {
  it('hiện phiên bản, cửa sổ, hai ngưỡng và bảng đủ bốn luật (nhãn, chỉ số, cách tổng hợp, điều kiện, điểm)', async () => {
    renderAt(<BurnoutRulesPanel />, URL_RULES);

    expect(await screen.findByText('v3')).toBeInTheDocument();
    expect(screen.getByText('7 ngày')).toBeInTheDocument();
    expect(screen.getByText('40 / 70')).toBeInTheDocument();
    expect(screen.getAllByRole('row').length - 1).toBe(4);
    expect(screen.getByText('Nhiều ngày liền hoạt động khuya')).toBeInTheDocument();
    expect(screen.getByText('Số ngày liên tiếp vượt ngưỡng')).toBeInTheDocument();
    expect(screen.getByText('> 180')).toBeInTheDocument();
    expect(screen.getAllByText('+30')).toHaveLength(2); // luật 1 và 2
    expect(screen.getAllByText('+20')).toHaveLength(2); // luật 3 và 4
    expect(
      screen.getByText('Bộ luật mới chỉ áp dụng cho lần đánh giá kế tiếp', { exact: false }),
    ).toBeInTheDocument();
  });

  it('đang dùng bộ luật mặc định (`isDefault`) → nói rõ thay vì ngày cập nhật', async () => {
    rules = makeRules({ isDefault: true, updatedAt: null, version: 1 });
    renderAt(<BurnoutRulesPanel />, URL_RULES);
    expect(await screen.findByText('Đang dùng bộ luật mặc định')).toBeInTheDocument();
  });

  it('chỉ có gamification:view → KHÔNG có nút Sửa bộ luật, có ghi chú chỉ đọc', async () => {
    signIn(['gamification:view']);
    renderAt(<BurnoutRulesPanel />, URL_RULES);
    await screen.findByText('Làm việc liên tục quá lâu');

    expect(screen.queryByRole('button', { name: 'Sửa bộ luật' })).not.toBeInTheDocument();
    expect(screen.getByText('Bạn chỉ có quyền xem bộ luật.', { exact: false })).toBeInTheDocument();
  });

  it('tải lỗi → "Không tải được bộ luật" + Thử lại, KHÔNG vẽ bảng rỗng', async () => {
    server.use(http.get('*/admin/wellbeing/rules', () => errorBody(500, 'SYS_001', 'Lỗi máy chủ')));
    renderAt(<BurnoutRulesPanel />, URL_RULES);

    expect(await screen.findByText('Không tải được bộ luật đánh giá')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa bộ luật' })).not.toBeInTheDocument();
  });

  it('nhật ký chỉnh sửa lọc đúng `wellbeing.rules-update` của `BurnoutRules` (khi có audit-log:view)', async () => {
    signIn(['gamification:view', 'audit-log:view']);
    renderAt(<BurnoutRulesPanel />, URL_RULES);
    await screen.findByText('Làm việc liên tục quá lâu');

    await waitFor(() => expect(auditQueries).toHaveLength(1));
    expect(auditQueries[0].get('action')).toBe('wellbeing.rules-update');
    expect(auditQueries[0].get('targetType')).toBe('BurnoutRules');
  });
});

describe('BurnoutRuleFormModal — kiểm tra ở client', () => {
  it('chưa sửa gì thì nút Lưu khoá; Cao ≤ Trung bình → lỗi ngay ở ô Mức cao và KHÔNG gửi', async () => {
    const { dialog } = await openEditor();
    expect(within(dialog).getByRole('button', { name: 'Lưu bộ luật' })).toBeDisabled();

    await setNumber(dialog, /Ngưỡng mức Cao/, '40');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), REASON);
    expect(within(dialog).getByRole('button', { name: 'Lưu bộ luật' })).toBeEnabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu bộ luật' }));

    expect(
      await within(dialog).findByText('Ngưỡng mức cao phải lớn hơn mức trung bình'),
    ).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it('thiếu lý do → không gửi; luật nhìn xa hơn cửa sổ (số ngày > cửa sổ) → lỗi ở ô Số ngày của luật đó', async () => {
    const { dialog } = await openEditor();
    await setNumber(dialog, /Cửa sổ chấm điểm/, '5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu bộ luật' }));

    expect(
      (await within(dialog).findAllByText('Không được dài hơn cửa sổ 5 ngày')).length,
    ).toBeGreaterThan(0);
    expect(await within(dialog).findByText('Lý do là bắt buộc')).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it('luật mới thêm phải có tên (thiếu → "Nhập tên luật") và được cấp mã tự động `custom-1`', async () => {
    const { dialog } = await openEditor();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm luật' }));
    expect(within(dialog).getByText('Mã: custom-1')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu bộ luật' }));
    expect(await within(dialog).findByText('Nhập tên luật')).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it('chỉ còn 1 luật thì không xoá được (BE đòi ít nhất 1 luật)', async () => {
    const { dialog } = await openEditor();
    for (const n of [4, 3, 2])
      await userEvent.click(within(dialog).getByRole('button', { name: `Xoá luật ${n}` }));
    expect(within(dialog).getByRole('button', { name: 'Xoá luật 1' })).toBeDisabled();
  });

  it('đủ 20 luật (trần BE) thì khoá nút Thêm luật', async () => {
    const { dialog } = await openEditor();
    for (let i = 0; i < 16; i += 1)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm luật' }));
    expect(within(dialog).getByRole('button', { name: 'Thêm luật' })).toBeDisabled();
  });
});

describe('BurnoutRuleFormModal — lưu', () => {
  it('PUT đúng thân (bộ luật BỎ version + expectedVersion + lý do), luật giữ nguyên mã; toast thành công; đóng form và tải lại', async () => {
    const { dialog } = await openEditor();
    await setNumber(dialog, /Ngưỡng mức Trung bình/, '50');
    await setNumber(dialog, /Điểm cộng \(luật 1\)/, '35');
    const before = gets;
    await save(dialog);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      windowDays: 7,
      levels: { medium: 50, high: 70 },
      rules: makeRules().rules.map((r) =>
        r.id === 'long-continuous-session' ? { ...r, points: 35 } : r,
      ),
      expectedVersion: 3,
      reason: REASON,
    });
    expect(Object.keys(puts[0])).not.toContain('version');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(gets).toBeGreaterThan(before));
    expect(
      useToastStore.getState().toasts.some((t) => /Đã lưu bộ luật/.test(String(t.title))),
    ).toBe(true);
  });

  it('luật mới: gửi kèm mã `custom-1` và nhãn đã nhập, ngưỡng lẻ được giữ nguyên', async () => {
    const { dialog } = await openEditor();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm luật' }));
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Tên luật 5' }),
      'Nghỉ quá ít giữa các phiên',
    );
    await setNumber(dialog, /Ngưỡng \(luật 5\)/, '2.5');
    await save(dialog);

    await waitFor(() => expect(puts).toHaveLength(1));
    const sent = puts[0].rules as Array<Record<string, unknown>>;
    expect(sent).toHaveLength(5);
    expect(sent[4]).toEqual({
      id: 'custom-1',
      label: 'Nghỉ quá ít giữa các phiên',
      metric: 'activeMinutes',
      aggregate: 'AVG',
      days: 7,
      op: 'GT',
      threshold: 2.5,
      points: 10,
    });
  });

  it('RES_003 (bộ luật vừa bị sửa ở nơi khác) → đóng form, tải lại bộ luật, có toast "vui lòng tải lại"', async () => {
    behaviours = [{ status: 409, code: 'RES_003' }];
    const { dialog } = await openEditor();
    await setNumber(dialog, /Ngưỡng mức Trung bình/, '50');
    const before = gets;
    await save(dialog);

    await waitFor(() => expect(puts).toHaveLength(1));
    await waitFor(() => expect(gets).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      useToastStore.getState().toasts.some((t) => /vui lòng tải lại/.test(String(t.title))),
    ).toBe(true);
  });

  it('`expectedVersion` là version LÚC MỞ form, không phải bản tải lại sau đó', async () => {
    const { dialog, queryClient } = await openEditor();
    rules = makeRules({ version: 4 }); // người khác vừa lưu — danh sách tải lại được v4, form đang mở vẫn dựng từ v3
    const before = gets;
    await queryClient.invalidateQueries({ queryKey: ['wellbeing', 'rules'] });
    await waitFor(() => expect(gets).toBeGreaterThan(before));
    await setNumber(dialog, /Ngưỡng mức Trung bình/, '50');
    await save(dialog);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].expectedVersion).toBe(3);
  });

  it('WELL_004 từ máy chủ → lỗi gắn vào ô Mức cao và form GIỮ mở', async () => {
    behaviours = [
      { status: 400, code: 'WELL_004', message: 'BE: ngưỡng cao phải hơn ngưỡng trung bình' },
    ];
    const { dialog } = await openEditor();
    await setNumber(dialog, /Ngưỡng mức Trung bình/, '50');
    await save(dialog);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(
      await within(dialog).findByText('BE: ngưỡng cao phải hơn ngưỡng trung bình'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: DIALOG })).toBeInTheDocument();
  });

  it('lỗi 5xx → form GIỮ mở để thử lại', async () => {
    behaviours = [{ status: 500, code: 'SYS_001' }];
    const { dialog } = await openEditor();
    await setNumber(dialog, /Ngưỡng mức Trung bình/, '50');
    await save(dialog);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(screen.getByRole('dialog', { name: DIALOG })).toBeInTheDocument();
  });
});
