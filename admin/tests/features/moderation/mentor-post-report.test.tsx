/**
 * Kiểm duyệt BÀI TÌM CỐ VẤN (p6-03 admin.md §2.1, §4): báo cáo `MENTOR_POST` trên trang chi tiết moderation.
 * - ngữ cảnh + nội dung bài (công khai với người đăng nhập → đầy đủ), KHÔNG có lời nhắn ứng tuyển (chỉ số lượng);
 * - ẩn bài: lý do ≥ 10 ký tự mới gửi, thành công → toast "ghi nhật ký"; còn cố vấn đang hoạt động → cảnh báo bằng chữ;
 * - bộ lọc hàng đợi có loại "Bài tìm cố vấn"; hành động báo cáo theo loại đích (cảnh cáo/khoá tác giả, không "Gỡ nội dung").
 * Mock ở tầng HTTP (MSW) — lỗi đi qua axios interceptor thật.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRoomSubscriptions } from '@/core/socket';
import { REPORT_TARGET_TYPE_OPTIONS } from '@/features/moderation/constants/moderation.constants';
import ReportDetailPage from '@/features/moderation/pages/ReportDetailPage';
import type { AdminMentorPost } from '@/features/moderation/types/mentor-post-moderation.types';
import type { ReportDetail } from '@/features/moderation/types/moderation.types';
import { availableActions } from '@/features/moderation/utils/report-actions';
import { scopeLabel } from '@/features/moderation/utils/report-links';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { fakeSocket } from './fake-socket';
import {
  AUTHOR_ID,
  makeDetail,
  makeGroup,
  okJson,
  PERM_MODERATE_LOCK,
  renderRoutes,
  REPORT_ID,
  signIn,
  WORKSPACE_ID,
} from './moderation-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket: shared } = await import('./fake-socket');
  return { io: vi.fn(() => shared) };
});

const POST_ID = '665f1c2e8a1b2c3d4e5f6c01';
const NOW = '2026-09-25T03:00:00.000Z';

function makePost(overrides: Partial<AdminMentorPost> = {}): AdminMentorPost {
  return {
    id: POST_ID,
    title: 'Cần cố vấn kiến trúc backend',
    description: 'Nhóm cần người review thiết kế cơ sở dữ liệu cho đồ án.',
    skillLabels: ['Node.js', 'MongoDB'],
    commitmentHoursPerWeek: 3,
    mentorsNeeded: 2,
    activeEngagements: 1,
    status: 'OPEN',
    applicantsCount: 4,
    pendingCount: 2,
    reportedCount: 3,
    expiresAt: '2026-10-10T00:00:00.000Z',
    createdAt: '2026-09-20T00:00:00.000Z',
    closedAt: null,
    hiddenAt: null,
    hiddenReason: null,
    version: 2,
    workspace: { id: WORKSPACE_ID, name: 'Nhóm đồ án' },
    createdBy: { id: AUTHOR_ID, name: 'Nguyễn Văn An' },
    ...overrides,
  };
}

let detail: ReportDetail;
let post: AdminMentorPost;
let hideCalls: Array<Record<string, unknown>> = [];

const server = setupServer(
  http.get('*/admin/reports/:id', () => okJson(detail)),
  http.get('*/audit-logs', () => okJson([], { nextCursor: null, hasMore: false, limit: 20 })),
  http.get('*/admin/mentor/posts/:id', () => okJson(post)),
  http.post('*/admin/mentor/posts/:id/hide', async ({ request }) => {
    hideCalls.push((await request.json()) as Record<string, unknown>);
    post = { ...post, hiddenAt: NOW, hiddenReason: 'lý do' };
    return okJson(post);
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
  detail = makeDetail({
    group: makeGroup({
      targetType: 'MENTOR_POST',
      targetId: POST_ID,
      groupKey: `MENTOR_POST:${POST_ID}`,
      reportCount: 3,
      reasons: ['SCAM'],
      scope: { type: null, isPrivate: false },
      handlerLevel: 'PLATFORM_ONLY',
    }),
    publicContent: undefined,
  });
  post = makePost();
  hideCalls = [];
  fakeSocket.emit.mockClear();
  resetRoomSubscriptions();
  useToastStore.setState({ toasts: [] });
  signIn([...PERM_MODERATE_LOCK, 'user:view']);
});

function renderDetail() {
  return renderRoutes(
    [
      { path: '/moderation', element: <output data-testid="queue">hàng đợi</output> },
      { path: '/moderation/:id', element: <ReportDetailPage /> },
    ],
    [`/moderation/${REPORT_ID}`],
  );
}

describe('báo cáo MENTOR_POST', () => {
  it('hiện ngữ cảnh + nội dung bài, số đơn (không lời nhắn), cảnh báo còn cố vấn đang hoạt động', async () => {
    renderDetail();
    expect(await screen.findByText('Bài tìm cố vấn bị báo cáo')).toBeInTheDocument();
    expect(screen.getByText('Cần cố vấn kiến trúc backend')).toBeInTheDocument();
    expect(
      screen.getByText('Nhóm cần người review thiết kế cơ sở dữ liệu cho đồ án.'),
    ).toBeInTheDocument();
    expect(screen.getByText('4 đơn · 2 đang chờ')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText(/Còn 1 cố vấn đang hoạt động/)).toBeInTheDocument();
  });

  it('ẩn bài: lý do < 10 ký tự bị chặn; hợp lệ → POST { reason } + toast "ghi nhật ký"', async () => {
    renderDetail();
    await screen.findByText('Xử lý bài tìm cố vấn');
    await userEvent.click(await screen.findByRole('button', { name: 'Ẩn bài' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Cố vấn đang hoạt động KHÔNG tự bị kết thúc/),
    ).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'ngan qua');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ẩn bài' }));
    expect(await within(dialog).findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(hideCalls).toEqual([]);

    await userEvent.clear(within(dialog).getByLabelText(/Lý do/));
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Bài lừa đảo đã xác minh');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ẩn bài' }));
    await waitFor(() => expect(hideCalls).toEqual([{ reason: 'Bài lừa đảo đã xác minh' }]));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.title)).toContain(
        'Đã ẩn bài tìm cố vấn và ghi nhật ký',
      ),
    );
  });

  it('bộ lọc có "Bài tìm cố vấn"; nhãn phạm vi; hành động: cảnh cáo/khoá tác giả, không "Gỡ nội dung"', () => {
    expect(REPORT_TARGET_TYPE_OPTIONS).toContainEqual({
      value: 'MENTOR_POST',
      label: 'Bài tìm cố vấn',
    });
    const group = makeGroup({ targetType: 'MENTOR_POST', scope: { type: null, isPrivate: false } });
    expect(scopeLabel(group)).toBe('Bảng tin cố vấn');
    const actions = availableActions(group, { canUpdate: true, canLockUser: true });
    expect(actions).toEqual(expect.arrayContaining(['DISMISS', 'WARN_AUTHOR', 'LOCK_AUTHOR']));
    expect(actions).not.toContain('REMOVE_CONTENT');
  });
});
