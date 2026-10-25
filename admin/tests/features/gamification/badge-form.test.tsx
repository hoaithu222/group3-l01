/**
 * Form huy hiệu + điều kiện (p4-03 admin.md §2.2, §4): counter CHỈ chọn được trong danh sách cố định (không có "giờ khuya"/"thời gian online"),
 * nhóm "Tất cả" luôn còn ≥ 1 điều kiện, "Kiểm tra" hiện số người đủ điều kiện và bị xoá khi điều kiện đổi, lưu thiếu lý do → không gửi. MSW.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import BadgeFormModal from '@/features/gamification/components/BadgeFormModal';
import { COUNTER_LABELS } from '@/features/gamification/constants/gamification.labels';
import { summarizeCriteria, toCriteria } from '@/features/gamification/utils/badge-form.utils';

import { makeBadge, okBody, renderAt, signIn } from './gamification-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'gamification:update']);
});

function mockWrites() {
  const state = { previews: [] as unknown[], patches: [] as unknown[] };
  server.use(
    http.post('*/admin/badges/preview', async ({ request }) => {
      state.previews.push(await request.json());
      return okBody({ eligibleUsers: 37 });
    }),
    http.patch('*/admin/badges/:id', async ({ request }) => {
      state.patches.push(await request.json());
      return okBody(makeBadge());
    }),
  );
  return state;
}

const renderForm = (badge = makeBadge()) => renderAt(<BadgeFormModal badge={badge} open onClose={() => undefined} />, '/gamification?tab=badges');

describe('BadgeFormModal — điều kiện', () => {
  it('counter chỉ chọn từ danh sách cố định (đúng whitelist BE), không có trường tự do và không có counter giờ khuya/online', async () => {
    mockWrites();
    renderForm();
    const dialog = await screen.findByRole('dialog');
    // Dropdown của counter không có nhãn truy cập riêng → tìm ô đang hiện "Task hoàn thành" (khác ô "Độ hiếm").
    const counter = within(dialog).getAllByRole('combobox').find((c) => c.textContent?.includes('Task hoàn thành'))!;
    await userEvent.setup().click(counter);

    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(Object.values(COUNTER_LABELS));
    expect(options.join('|')).not.toMatch(/khuya|online|trực tuyến/i);
  });

  it('nhóm "Tất cả" luôn còn ít nhất một điều kiện (Xoá bị khoá); nhóm "Một trong" được rỗng và thêm được', async () => {
    mockWrites();
    renderForm();
    const dialog = await screen.findByRole('dialog');
    const removeButtons = within(dialog).getAllByRole('button', { name: 'Xoá' });
    expect(removeButtons).toHaveLength(1); // chỉ nhóm "Tất cả" có một dòng
    expect(removeButtons[0]).toBeDisabled();

    await userEvent.setup().click(within(dialog).getAllByRole('button', { name: 'Thêm điều kiện' })[1]!);
    expect(within(dialog).getAllByRole('button', { name: 'Xoá' })).toHaveLength(2);
    expect(within(dialog).getAllByRole('button', { name: 'Xoá' })[1]).toBeEnabled();
  });

  it('"Kiểm tra" gửi đúng criteria và hiện "Hiện có 37 người đủ điều kiện"; đổi điều kiện → kết quả cũ bị xoá', async () => {
    const state = mockWrites();
    renderForm();
    const dialog = await screen.findByRole('dialog');
    const user = userEvent.setup();

    await user.click(within(dialog).getByRole('button', { name: 'Kiểm tra' }));
    expect(await within(dialog).findByText('Hiện có 37 người đủ điều kiện')).toBeInTheDocument();
    expect(state.previews).toEqual([{ criteria: { all: [{ counter: 'tasksDone', op: 'gte', value: 50 }] } }]);

    await user.click(within(dialog).getAllByRole('button', { name: 'Thêm điều kiện' })[0]!);
    expect(within(dialog).queryByText('Hiện có 37 người đủ điều kiện')).not.toBeInTheDocument();
  });

  it('lưu thiếu lý do → KHÔNG gửi PATCH; đủ lý do → PATCH kèm criteria, expectedVersion và lý do', async () => {
    const state = mockWrites();
    renderForm();
    const dialog = await screen.findByRole('dialog');
    const user = userEvent.setup();

    await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    expect(state.patches).toHaveLength(0);

    await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Điều chỉnh mô tả huy hiệu');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(state.patches).toHaveLength(1));
    expect(state.patches[0]).toMatchObject({ expectedVersion: 3, reason: 'Điều chỉnh mô tả huy hiệu', name: 'Chăm chỉ', criteria: { all: [{ counter: 'tasksDone', op: 'gte', value: 50 }] } });
  });
});

describe('summarizeCriteria / toCriteria', () => {
  it('tóm tắt điều kiện dạng chữ, có nhóm "một trong"; dạng lạ → "—"', () => {
    expect(summarizeCriteria({ all: [{ counter: 'tasksDone', op: 'gte', value: 50 }] })).toBe('Task hoàn thành ≥ 50');
    expect(summarizeCriteria({ all: [{ counter: 'tasksDone', value: 1 }, { counter: 'level', value: 1500 }] })).toBe('Task hoàn thành ≥ 1 và Cấp độ ≥ 1.500');
    expect(summarizeCriteria({ all: [{ counter: 'level', value: 10 }], any: [{ counter: 'srReviewDays', value: 30 }, { counter: 'quizzesPassed', value: 5 }] })).toBe(
      'Cấp độ ≥ 10; một trong: Ngày ôn tập ≥ 30 hoặc Bài kiểm tra đạt ≥ 5',
    );
    for (const odd of [null, undefined, 'x', 42, {}, { all: 'x' }, { all: [{ counter: 5 }] }]) expect(summarizeCriteria(odd)).toBe('—');
    // counter lạ (BE thêm sau) vẫn hiện tên gốc thay vì ném lỗi
    expect(summarizeCriteria({ all: [{ counter: 'newCounter', value: 3 }] })).toBe('newCounter ≥ 3');
  });

  it('toCriteria: `any` chỉ có khi có mệnh đề; op luôn gte', () => {
    expect(toCriteria([{ counter: 'tasksDone', value: 1 }], [])).toEqual({ all: [{ counter: 'tasksDone', op: 'gte', value: 1 }] });
    expect(toCriteria([{ counter: 'tasksDone', value: 1 }], [{ counter: 'level', value: 2 }])).toEqual({
      all: [{ counter: 'tasksDone', op: 'gte', value: 1 }],
      any: [{ counter: 'level', op: 'gte', value: 2 }],
    });
  });
});
