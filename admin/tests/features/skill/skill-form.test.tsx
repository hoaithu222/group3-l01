/**
 * Form kỹ năng (p6-06 admin.md §2.2, §4): mã sai mẫu báo lỗi (không gửi), nhãn khớp hiện dạng CHUẨN HOÁ, xem trước gọi lại sau debounce khi đổi
 * tiêu chí, Callout khi tiêu chí khó hơn bản đã lưu, 409 `RES_003` → banner "Dữ liệu đã thay đổi" và GIỮ form. Mock tầng HTTP (MSW).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import SkillForm from '@/features/skill/components/SkillForm';

import { errorBody, makeSkill, okBody, renderAt, signIn } from './skill-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['skill:view', 'skill:create', 'skill:update']));

function mockApi(opts: { patchStatus?: number } = {}) {
  const state = { previews: [] as Array<string | null>, creates: [] as unknown[], patches: [] as unknown[] };
  server.use(
    http.get('*/admin/skills/label-suggestions', () => okBody([{ name: 'Express', normalized: 'express', count: 42 }])),
    http.get('*/admin/skills/:id/eligible-preview', ({ request }) => {
      state.previews.push(new URL(request.url).searchParams.get('criteria'));
      return okBody({ eligibleCount: 1284, alreadyHolding: 1120, willGrant: 164, sampleUserIds: [] });
    }),
    http.post('*/admin/skills', async ({ request }) => {
      state.creates.push(await request.json());
      return okBody(makeSkill({ id: 's9', isActive: false }));
    }),
    http.patch('*/admin/skills/:id', async ({ request }) => {
      state.patches.push(await request.json());
      return opts.patchStatus === 409 ? errorBody(409, 'RES_003', 'Dữ liệu đã thay đổi') : okBody({ ...makeSkill({ version: 5 }), criteriaHarder: false });
    }),
  );
  return state;
}

const renderEdit = () => renderAt(<SkillForm canEdit skill={makeSkill()} onReload={() => undefined} />, '/skill/s1');

describe('SkillForm', () => {
  it('mã sai mẫu → báo lỗi, KHÔNG gửi', async () => {
    const state = mockApi();
    renderAt(<SkillForm canEdit skill={null} />, '/skill/new', [{ path: '/skill/:id', element: <p>chi tiết</p> }]);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Mã/), 'Node JS');
    await user.type(screen.getByLabelText(/^Tên kỹ năng/), 'Node.js');
    await user.type(screen.getByLabelText(/^Nhãn task khớp/), 'Node.js');
    await user.click(screen.getByRole('button', { name: 'Tạo kỹ năng' }));
    expect(await screen.findByText('Mã 2–40 ký tự a-z, 0-9, dấu gạch ngang')).toBeInTheDocument();
    expect(state.creates).toEqual([]);
    expect(screen.getByText(/Lưu kỹ năng trước/)).toBeInTheDocument();
  });

  it('nhãn khớp hiện NGAY dạng chuẩn hoá ("Node.js" → nodejs, "React JS" → reactjs); gợi ý thêm được', async () => {
    mockApi();
    renderAt(<SkillForm canEdit skill={null} />, '/skill/new');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nhãn task khớp/), 'Node.js, React JS');
    const group = await screen.findByRole('group', { name: 'Dạng chuẩn hoá' });
    expect(group).toHaveTextContent('nodejs');
    expect(group).toHaveTextContent('reactjs');
    await user.click(await screen.findByRole('button', { name: 'Express (42)' }));
    expect(screen.getByRole('group', { name: 'Dạng chuẩn hoá' })).toHaveTextContent('express');
  });

  it('xem trước: số liệu từ BE; đổi tiêu chí → gọi lại sau debounce với tiêu chí mới; khó hơn → Callout không thu hồi', async () => {
    const state = mockApi();
    renderEdit();
    expect(await screen.findByText('1.284')).toBeInTheDocument();
    expect(screen.queryByText('Tiêu chí khó hơn bản đã lưu')).not.toBeInTheDocument();
    const user = userEvent.setup();
    const tasks = screen.getByLabelText(/^Số task Done tối thiểu/);
    await user.clear(tasks);
    await user.type(tasks, '40');
    expect(await screen.findByText('Tiêu chí khó hơn bản đã lưu')).toBeInTheDocument();
    await waitFor(() => expect(state.previews.some((c) => c !== null && JSON.parse(c).requiredTasksDone === 40)).toBe(true), { timeout: 3000 });
  });

  it('409 RES_003 → banner "Dữ liệu đã thay đổi", form GIỮ nội dung đang nhập', async () => {
    const state = mockApi({ patchStatus: 409 });
    renderEdit();
    const user = userEvent.setup();
    const name = screen.getByLabelText(/^Tên kỹ năng/);
    await user.clear(name);
    await user.type(name, 'Node.js nâng cao');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Dữ liệu đã thay đổi')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tên kỹ năng/)).toHaveValue('Node.js nâng cao');
    expect(state.patches[0]).toMatchObject({ expectedVersion: 4, name: 'Node.js nâng cao', labelMatch: ['nodejs', 'express'] });
  });
});
