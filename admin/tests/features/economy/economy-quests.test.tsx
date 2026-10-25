/**
 * Nhóm "Nhiệm vụ ngày" (p7-02 admin.md §2.1, §4): bảng theo thứ tự, tạo/sửa (RHF + Zod: mã, tiêu đề, mô tả, chỉ số cố định, mục tiêu, xu, thứ tự, lý do ≥ 10 ký tự),
 * sửa chỉ gửi trường ĐÃ ĐỔI kèm `expectedVersion`, `RES_003` → tải lại, trùng mã gắn vào ô mã, bật/tắt hỏi lý do, thiếu `gamification:update` → chỉ xem. MSW.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import QuestTable from '@/features/economy/components/QuestTable';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { errorBody, makeQuest, okBody, renderAt, signIn } from './economy-fixtures';

type Behaviour = 'ok' | { status: number; code: string; message?: string };

let quests = [makeQuest()];
let gets = 0;
let creates: Array<Record<string, unknown>> = [];
let patches: Array<{ id: string; body: Record<string, unknown> }> = [];
let behaviours: Behaviour[] = [];

const server = setupServer(
  http.get('*/admin/economy/quests', () => {
    gets += 1;
    return okBody(quests);
  }),
  http.post('*/admin/economy/quests', async ({ request }) => {
    creates.push((await request.json()) as Record<string, unknown>);
    const next = behaviours.shift() ?? 'ok';
    if (next === 'ok') return HttpResponse.json({ success: true, data: makeQuest({ id: 'new1' }) }, { status: 201 });
    return errorBody(next.status, next.code, next.message ?? 'Lỗi từ BE');
  }),
  http.patch('*/admin/economy/quests/:id', async ({ request, params }) => {
    patches.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> });
    const next = behaviours.shift() ?? 'ok';
    if (next === 'ok') return okBody(makeQuest({ version: 6 }));
    return errorBody(next.status, next.code, next.message ?? 'Lỗi từ BE', { currentVersion: 7 });
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
  quests = [makeQuest()];
  gets = 0;
  creates = [];
  patches = [];
  behaviours = [];
  useToastStore.setState({ toasts: [] });
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'gamification:update']);
});

const URL_QUESTS = '/gamification?tab=economy&section=quests';
const REASON = 'Thêm nhiệm vụ cho tuần ôn thi';
const toastTitles = () => useToastStore.getState().toasts.map((t) => String(t.title));

async function typeInto(dialog: HTMLElement, label: RegExp, text: string) {
  const box = within(dialog).getByLabelText(label);
  await userEvent.clear(box);
  if (text !== '') await userEvent.type(box, text); // user-event không nhận chuỗi rỗng
}

async function openCreate() {
  renderAt(<QuestTable />, URL_QUESTS);
  await userEvent.click(await screen.findByRole('button', { name: 'Thêm nhiệm vụ' }));
  return screen.findByRole('dialog', { name: 'Tạo nhiệm vụ ngày' });
}

async function fillCreate(dialog: HTMLElement, over: { code?: string; title?: string; target?: string; coins?: string; reason?: string } = {}) {
  await typeInto(dialog, /^Mã/, over.code ?? 'on-10-the');
  await typeInto(dialog, /^Tiêu đề/, over.title ?? 'Ôn 10 thẻ');
  await typeInto(dialog, /^Mô tả/, 'Ôn tối thiểu mười thẻ trong ngày');
  await typeInto(dialog, /^Mục tiêu/, over.target ?? '10');
  await typeInto(dialog, /^Thưởng \(xu\)/, over.coins ?? '15');
  await typeInto(dialog, /^Lý do/, over.reason ?? REASON);
}

describe('QuestTable — danh sách', () => {
  it('hiện nhiệm vụ theo thứ tự với chỉ số bằng tiếng Việt, mục tiêu và xu thưởng', async () => {
    quests = [makeQuest({ id: 'q2', title: 'Ôn 5 thẻ', order: 2, metric: 'srReviewDays' }), makeQuest()];
    renderAt(<QuestTable />, URL_QUESTS);

    await screen.findByText('Hoàn thành 3 task');
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Hoàn thành 3 task')).toBeInTheDocument(); // order 1 trước order 2
    expect(within(rows[0]!).getByText('Task hoàn thành')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Ngày ôn tập')).toBeInTheDocument();
  });

  it('tải lỗi → "Không tải được nhiệm vụ ngày" + Thử lại', async () => {
    server.use(http.get('*/admin/economy/quests', () => errorBody(500, 'SYS_001', 'Lỗi máy chủ')));
    renderAt(<QuestTable />, URL_QUESTS);
    expect(await screen.findByText('Không tải được nhiệm vụ ngày')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có nhiệm vụ ngày nào')).not.toBeInTheDocument();
  });

  it('chỉ có gamification:view → không có nút Thêm/Sửa, công tắc bị khoá', async () => {
    signIn(['gamification:view']);
    renderAt(<QuestTable />, URL_QUESTS);
    await screen.findByText('Hoàn thành 3 task');
    expect(screen.queryByRole('button', { name: 'Thêm nhiệm vụ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Sửa nhiệm vụ/ })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Bật nhiệm vụ — Hoàn thành 3 task' })).toBeDisabled();
  });
});

describe('QuestFormModal — tạo', () => {
  it('gửi đúng DTO (chỉ số mặc định tasksDone, thứ tự 0, bật); đóng modal, toast, tải lại danh sách', async () => {
    const dialog = await openCreate();
    await fillCreate(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo nhiệm vụ' }));

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0]).toEqual({
      code: 'on-10-the',
      title: 'Ôn 10 thẻ',
      description: 'Ôn tối thiểu mười thẻ trong ngày',
      metric: 'tasksDone',
      target: 10,
      coins: 15,
      isActive: true,
      order: 0,
      reason: REASON,
    });
    await waitFor(() => expect(toastTitles()).toContain('Đã tạo nhiệm vụ và ghi nhật ký'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tạo nhiệm vụ ngày' })).not.toBeInTheDocument());
    await waitFor(() => expect(gets).toBeGreaterThan(1));
  });

  it('chọn chỉ số khác trong danh sách cố định → gửi đúng metric', async () => {
    const dialog = await openCreate();
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Đếm theo/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Bài kiểm tra đạt' }));
    await fillCreate(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo nhiệm vụ' }));

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0]).toMatchObject({ metric: 'quizzesPassed' });
  });

  it('mã viết hoa / tiêu đề ngắn / thiếu mục tiêu / lý do ngắn → báo lỗi từng ô, KHÔNG gọi API', async () => {
    const dialog = await openCreate();
    await fillCreate(dialog, { code: 'On-The', title: 'Ô', target: '', reason: 'ngắn' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo nhiệm vụ' }));

    expect(await within(dialog).findByText('Mã chỉ gồm chữ thường, số và dấu gạch ngang')).toBeInTheDocument();
    expect(within(dialog).getByText('Tiêu đề tối thiểu 2 ký tự')).toBeInTheDocument();
    expect(within(dialog).getByText('Nhập mục tiêu')).toBeInTheDocument();
    expect(within(dialog).getByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(creates).toEqual([]);
  });

  it('trùng mã (409) → lỗi gắn vào ô Mã, modal giữ mở', async () => {
    behaviours = [{ status: 409, code: 'RES_002', message: 'Mã nhiệm vụ đã tồn tại' }];
    const dialog = await openCreate();
    await fillCreate(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo nhiệm vụ' }));

    await waitFor(() => expect(creates).toHaveLength(1));
    expect((await within(dialog).findAllByText('Mã nhiệm vụ đã tồn tại')).length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog', { name: 'Tạo nhiệm vụ ngày' })).toBeInTheDocument();
  });
});

describe('QuestFormModal — sửa', () => {
  async function openEdit() {
    renderAt(<QuestTable />, URL_QUESTS);
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa nhiệm vụ Hoàn thành 3 task' }));
    return screen.findByRole('dialog', { name: 'Sửa nhiệm vụ ngày' });
  }

  it('mã bị khoá; chưa đổi gì thì nút Lưu khoá; đổi xu thưởng → chỉ gửi coins + expectedVersion + reason', async () => {
    const dialog = await openEdit();
    expect(within(dialog).getByLabelText(/^Mã/)).toBeDisabled();
    const save = within(dialog).getByRole('button', { name: 'Lưu thay đổi' });
    expect(save).toBeDisabled();

    await typeInto(dialog, /^Thưởng \(xu\)/, '25');
    await typeInto(dialog, /^Lý do/, 'Tăng thưởng cho nhiệm vụ khó');
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ id: 'q1', body: { expectedVersion: 5, reason: 'Tăng thưởng cho nhiệm vụ khó', coins: 25 } });
    await waitFor(() => expect(toastTitles()).toContain('Đã cập nhật nhiệm vụ và ghi nhật ký'));
  });

  it('RES_003 → đóng modal (nó cầm bản cũ), tải lại danh sách và báo "vui lòng tải lại"', async () => {
    behaviours = [{ status: 409, code: 'RES_003' }];
    const dialog = await openEdit();
    await typeInto(dialog, /^Thưởng \(xu\)/, '25');
    await typeInto(dialog, /^Lý do/, 'Tăng thưởng cho nhiệm vụ khó');
    const before = gets;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sửa nhiệm vụ ngày' })).not.toBeInTheDocument());
    await waitFor(() => expect(gets).toBeGreaterThan(before));
    expect(toastTitles().some((t) => /vui lòng tải lại/.test(t))).toBe(true);
  });
});

describe('Bật/tắt nhiệm vụ', () => {
  it('bấm công tắc → hộp thoại lý do (nêu hệ quả); thiếu lý do KHÔNG gửi; đủ lý do → PATCH isActive=false kèm expectedVersion', async () => {
    renderAt(<QuestTable />, URL_QUESTS);
    await userEvent.click(await screen.findByRole('switch', { name: 'Bật nhiệm vụ — Hoàn thành 3 task' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tắt nhiệm vụ' });
    expect(within(dialog).getByText(/không nhận thưởng được nữa/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    expect(patches).toEqual([]);

    await userEvent.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Nhiệm vụ gây tranh cãi về cách đếm');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]!.body).toEqual({ expectedVersion: 5, isActive: false, reason: 'Nhiệm vụ gây tranh cãi về cách đếm' });
  });
});
