/**
 * Tab "Kỹ năng" trong ngăn kéo người dùng (p6-06 admin.md §2.3, §4): tiến độ + trạng thái; không `skill:update` → KHÔNG có Thu hồi/Khôi phục;
 * Thu hồi gửi lý do; ngăn kéo minh chứng KHÔNG hiện tiêu đề task (kể cả khi fixture lỡ có). Mock tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import UserSkillsTab from '@/features/skill/components/UserSkillsTab';

import { makeRow, okBody, renderAt, signIn } from './skill-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const REVOKED = makeRow({
  skill: { ...makeRow().skill, id: 's2', name: 'ReactJS' },
  badge: { unlockedAt: '2026-09-01T00:00:00.000Z', revokedAt: '2026-09-15T00:00:00.000Z', revokedBy: { id: 'ops9', name: 'Vận hành B' }, revokedReason: 'Gắn nhãn tràn lan' },
});
const NOT_YET = makeRow({ skill: { ...makeRow().skill, id: 's3', name: 'Python' }, badge: null, progress: { ...makeRow().progress, tasksDone: 4, achieved: false } });

function mockApi() {
  const state = { revokes: [] as unknown[] };
  server.use(
    http.get('*/admin/users/:id/skills', () => okBody([makeRow(), REVOKED, NOT_YET])),
    http.get('*/admin/users/:id/skills/:skillId/proof', () =>
      okBody({
        skill: { id: 's1', code: 'nodejs', name: 'Node.js' },
        unlockedAt: '2026-09-12T00:00:00.000Z',
        revoked: false,
        tasksDone: 31,
        storyPoints: 64.5,
        avgPeerScore: 8.2,
        criteriaSnapshot: makeRow().skill.criteria,
        // Fixture "lỡ" kèm tiêu đề: giao diện vẫn KHÔNG được hiện (admin không đọc nội dung task).
        tasks: [{ taskRef: '#a1b2c3', storyPoints: 5, completedAt: '2026-09-10T00:00:00.000Z', reviewScore: 8.5, active: true, title: 'Dự án mật của nhóm' }],
      }),
    ),
    http.post('*/admin/users/:id/skills/:skillId/revoke', async ({ request }) => {
      state.revokes.push(await request.json());
      return okBody({ unlockedAt: '2026-09-12T00:00:00.000Z', revokedAt: '2026-09-25T00:00:00.000Z', revokedBy: { id: 'ops1', name: 'Vận hành' }, revokedReason: 'x' });
    }),
  );
  return state;
}

const renderTab = () => renderAt(<UserSkillsTab userId="u1" userName="Nguyễn Văn An" />, '/user');

describe('UserSkillsTab', () => {
  it('hiện tiến độ + trạng thái (Đã đạt / Đã thu hồi kèm lý do, người thu hồi / Chưa đạt)', async () => {
    signIn(['skill:view', 'skill:update']);
    mockApi();
    renderTab();
    expect(await screen.findByText('Đã đạt 12/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Đã thu hồi 15/09/2026')).toBeInTheDocument();
    expect(screen.getByText(/Gắn nhãn tràn lan · bởi Vận hành B/)).toBeInTheDocument();
    expect(screen.getByText('Chưa đạt')).toBeInTheDocument();
    expect(screen.getByText('4/30 task')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
  });

  it('không có skill:update → không có Thu hồi/Khôi phục (vẫn xem được minh chứng)', async () => {
    signIn(['skill:view']);
    mockApi();
    renderTab();
    await screen.findByText('Đã đạt 12/09/2026');
    expect(screen.queryByRole('button', { name: 'Thu hồi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khôi phục' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Xem minh chứng' })).toHaveLength(2);
  });

  it('Thu hồi: lý do ≥ 10 ký tự gửi lên BE', async () => {
    signIn(['skill:view', 'skill:update']);
    const state = mockApi();
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Thu hồi' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('không tự cấp lại');
    await user.type(within(dialog).getByRole('textbox'), 'Gắn nhãn không đúng thực tế công việc');
    await user.click(within(dialog).getByRole('button', { name: /Xác nhận|Thu hồi/ }));
    await waitFor(() => expect(state.revokes).toEqual([{ reason: 'Gắn nhãn không đúng thực tế công việc' }]));
  });

  it('ngăn kéo minh chứng: chỉ id rút gọn, điểm, ngày, review — KHÔNG tiêu đề task', async () => {
    signIn(['skill:view']);
    mockApi();
    renderTab();
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: 'Xem minh chứng' }))[0]!);
    const list = await screen.findByRole('list', { name: 'Task minh chứng' });
    expect(list).toHaveTextContent('#a1b2c3');
    expect(list).toHaveTextContent('review 8,5');
    expect(document.body).not.toHaveTextContent('Dự án mật của nhóm');
  });
});
