/**
 * Tab `members` sau p3-04 (admin.md §1, §2, §4): khách hiện vai trò + cột "Hết hạn" (< 48 giờ có chữ
 * "Sắp hết hạn"), thu hồi khách cần lý do ≥ 10 ký tự, khối lời mời (email che, không token) và yêu cầu
 * chờ duyệt (đếm + tên + thời gian) — TẤT CẢ chỉ đọc trừ "Thu hồi". Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceMembersTab from '@/features/workspace/components/tabs/WorkspaceMembersTab';
import { MEMBER_ROLE_FILTER_OPTIONS } from '@/features/workspace/constants/workspace-members.constants';

import {
  ACCESS_SUMMARY,
  errorBody,
  okBody,
  renderWithRouter,
  signIn,
} from './p3-fixtures';

const META = { page: 1, limit: 20, total: 0, totalPages: 1, hasNext: false, hasPrev: false };

const hoursFromNow = (h: number) => dayjs().add(h, 'hour').toISOString();

/** Hạn của hai khách dùng lại khi so ngày hiển thị (tính một lần để hai chỗ dùng cùng một mốc). */
const SOON_AT = hoursFromNow(30);
const FAR_AT = hoursFromNow(24 * 20);

const member = (over: Record<string, unknown> = {}) => ({
  user: { id: 'u-owner', name: 'Trưởng nhóm Nam' },
  role: 'OWNER',
  status: 'ACTIVE',
  joinedAt: '2026-01-01T00:00:00.000Z',
  invitedBy: null,
  expiresAt: null,
  banReason: null,
  ...over,
});

const MEMBER_ROWS = [
  member(),
  member({ user: { id: 'u-soon', name: 'Khách sắp hết hạn' }, role: 'GUEST', expiresAt: SOON_AT }),
  member({ user: { id: 'u-far', name: 'Khách còn lâu' }, role: 'GUEST', expiresAt: FAR_AT }),
  member({ user: { id: 'u-late', name: 'Khách quá hạn' }, role: 'GUEST', expiresAt: hoursFromNow(-3) }),
];

const PENDING_ROWS = [
  member({
    user: { id: 'u-p1', name: 'Người xin vào Một' },
    role: 'MEMBER',
    status: 'PENDING',
    joinedAt: '2026-09-01T00:00:00.000Z',
    requestedAt: '2026-09-05T09:15:00.000Z',
  }),
  member({
    user: { id: 'u-p2', name: 'Người xin vào Hai' },
    role: 'MEMBER',
    status: 'PENDING',
    joinedAt: '2026-09-06T10:30:00.000Z',
  }),
];

const INVITATIONS = [
  {
    id: 'inv-1',
    email: 'l***@gmail.com',
    role: 'GUEST',
    invitedBy: '64a1b2c3d4e5f60718293b0a',
    status: 'PENDING',
    expiresAt: '2026-09-25T10:00:00.000Z',
  },
  {
    id: 'inv-2',
    email: 'm***@truong.edu.vn',
    role: 'MEMBER',
    invitedBy: null,
    status: 'EXPIRED',
    expiresAt: '2026-09-01T10:00:00.000Z',
  },
];

interface RevokeBody {
  reason: string;
  ban: boolean;
}

let membersQueries: Array<Record<string, string>> = [];
let revokeCalls: Array<{ userId: string; body: RevokeBody }> = [];

const server = setupServer(
  http.get('*/admin/workspaces/:id/members', ({ request }) => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    membersQueries.push(params);
    const rows = params.status === 'PENDING' ? PENDING_ROWS : params.status === 'BANNED' ? [] : MEMBER_ROWS;
    return okBody(rows, { ...META, total: rows.length });
  }),
  http.get('*/admin/workspaces/:id/access-summary', () => okBody(ACCESS_SUMMARY)),
  http.get('*/admin/workspaces/:id/invitations', () =>
    okBody(INVITATIONS, { ...META, limit: 10, total: INVITATIONS.length }),
  ),
  http.post('*/admin/workspaces/:id/members/:userId/revoke', async ({ request, params }) => {
    revokeCalls.push({ userId: String(params.userId), body: (await request.json()) as RevokeBody });
    return okBody(null);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  membersQueries = [];
  revokeCalls = [];
  signIn(['workspace:view']);
});

const renderTab = (url = '/') => renderWithRouter(<WorkspaceMembersTab workspaceId="ws-1" />, url);

/** Hàng bảng chứa `text` (bảng thành viên là bảng đầu tiên trong tab). */
const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement;

describe('bảng thành viên — khách và hạn truy cập', () => {
  it('khách hiện nhãn vai trò "Khách" và cột hạn; còn ≤ 48 giờ có "Sắp hết hạn", quá hạn có "Đã quá hạn"', async () => {
    renderTab();
    await screen.findByText('Khách sắp hết hạn');

    const soon = rowOf('Khách sắp hết hạn');
    expect(within(soon).getByText('Khách')).toBeInTheDocument();
    expect(within(soon).getByText('Sắp hết hạn')).toBeInTheDocument();
    expect(soon).toHaveTextContent(dayjs(SOON_AT).format('DD/MM/YYYY'));

    const far = rowOf('Khách còn lâu');
    expect(within(far).queryByText('Sắp hết hạn')).not.toBeInTheDocument();
    expect(far).toHaveTextContent(dayjs(FAR_AT).format('DD/MM/YYYY'));

    expect(within(rowOf('Khách quá hạn')).getByText('Đã quá hạn')).toBeInTheDocument();

    // Vai trò khác không phải khách: cột hạn là "—".
    expect(within(rowOf('Trưởng nhóm Nam')).queryByText('Sắp hết hạn')).not.toBeInTheDocument();
  });

  it('bộ lọc vai trò có "Khách" và gửi role=GUEST khi lọc; trạng thái "Chờ tham gia" có sẵn', async () => {
    expect(MEMBER_ROLE_FILTER_OPTIONS.map((o) => o.value)).toContain('GUEST');
    expect(MEMBER_ROLE_FILTER_OPTIONS.find((o) => o.value === 'GUEST')?.label).toBe('Khách');

    renderTab('/?role=GUEST&status=PENDING');
    await screen.findByText('Người xin vào Một');
    await waitFor(() =>
      expect(membersQueries.some((q) => q.role === 'GUEST' && q.status === 'PENDING')).toBe(true),
    );
  });

  it('thu hồi khách: lý do < 10 ký tự bị chặn; hợp lệ ⇒ POST revoke { reason, ban }', async () => {
    signIn(['workspace:view', 'workspace:update']);
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Khách còn lâu');

    await user.click(within(rowOf('Khách còn lâu')).getByRole('button', { name: 'Thu hồi' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Lý do/), 'ngắn');
    await user.click(within(dialog).getByRole('button', { name: 'Thu hồi' }));
    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(revokeCalls).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/Lý do/));
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Khách hết hợp đồng cố vấn');
    await user.click(within(dialog).getByRole('button', { name: 'Thu hồi' }));

    await waitFor(() => expect(revokeCalls).toHaveLength(1));
    expect(revokeCalls[0]).toEqual({
      userId: 'u-far',
      body: { reason: 'Khách hết hợp đồng cố vấn', ban: false },
    });
  });

  it('thiếu workspace:update ⇒ không có nút "Thu hồi" nào', async () => {
    renderTab();
    await screen.findByText('Khách còn lâu');
    expect(screen.queryByRole('button', { name: 'Thu hồi' })).not.toBeInTheDocument();
  });
});

describe('khối khách / lời mời / yêu cầu chờ duyệt (chỉ đọc)', () => {
  it('ba thẻ số: khách đang hoạt động (kèm sắp hết hạn), lời mời đang chờ, yêu cầu chờ duyệt', async () => {
    renderTab();
    const card = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    await screen.findByText('Khách đang hoạt động');

    // Số về sau nhãn một nhịp (access-summary tải riêng) — chờ tới khi hết "—".
    await waitFor(() => expect(card('Khách đang hoạt động')).toHaveTextContent('3'));
    expect(card('Khách đang hoạt động')).toHaveTextContent('1 sắp hết hạn trong 48 giờ');
    expect(card('Lời mời đang chờ')).toHaveTextContent('5');
    expect(card('Yêu cầu chờ duyệt')).toHaveTextContent('2');
  });

  it('bảng lời mời: email che, vai trò, người mời, trạng thái, hết hạn; không nút hành động', async () => {
    renderTab();
    const emailCell = await screen.findByText('l***@gmail.com');
    const row = emailCell.closest('tr') as HTMLElement;

    expect(within(row).getByText('Khách')).toBeInTheDocument();
    expect(within(row).getByText('#293b0a')).toBeInTheDocument(); // người mời: mã rút gọn
    expect(within(row).getByText('Đang chờ')).toBeInTheDocument();
    expect(row).toHaveTextContent(dayjs(INVITATIONS[0].expiresAt).format('DD/MM/YYYY'));
    expect(within(row).queryAllByRole('button')).toHaveLength(0);

    const other = screen.getByText('m***@truong.edu.vn').closest('tr') as HTMLElement;
    expect(within(other).getByText('Hết hạn')).toBeInTheDocument();
    expect(within(other).getByText('—')).toBeInTheDocument(); // không có người mời
  });

  it('yêu cầu chờ duyệt: đếm + tên + thời gian gửi (ưu tiên requestedAt, rơi về joinedAt); chỉ đọc', async () => {
    renderTab();
    expect(await screen.findByText('Yêu cầu chờ duyệt (2)')).toBeInTheDocument();

    const one = screen.getByText('Người xin vào Một').closest('tr') as HTMLElement;
    // requestedAt (giờ địa phương của máy chạy test, nên định dạng bằng dayjs như UI).
    expect(one).toHaveTextContent(dayjs('2026-09-05T09:15:00.000Z').format('HH:mm DD/MM/YYYY'));
    const two = screen.getByText('Người xin vào Hai').closest('tr') as HTMLElement;
    // Rơi về joinedAt khi BE cũ chưa gửi requestedAt.
    expect(two).toHaveTextContent(dayjs('2026-09-06T10:30:00.000Z').format('HH:mm DD/MM/YYYY'));

    expect(within(one).queryAllByRole('button')).toHaveLength(0); // không duyệt/từ chối thay chủ nhóm
    expect(screen.queryByRole('button', { name: /duyệt|từ chối/i })).not.toBeInTheDocument();
  });

  it('không có yêu cầu / lời mời: hiện thông báo rỗng', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/members', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        const rows = status === 'PENDING' ? [] : MEMBER_ROWS;
        return okBody(rows, { ...META, total: rows.length });
      }),
      http.get('*/admin/workspaces/:id/invitations', () => okBody([], { ...META, total: 0 })),
    );
    renderTab();

    expect(await screen.findByText('Không có yêu cầu nào đang chờ duyệt')).toBeInTheDocument();
    expect(await screen.findByText('Nhóm chưa có lời mời email nào')).toBeInTheDocument();
    expect(screen.getByText('Yêu cầu chờ duyệt (0)')).toBeInTheDocument();
  });

  it('BE chưa có access-summary / invitations (lỗi) ⇒ thẻ số hiện "—", bảng lời mời báo lỗi, phần còn lại vẫn chạy', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/access-summary', () => errorBody(404, 'RES_001', 'Không tìm thấy')),
      http.get('*/admin/workspaces/:id/invitations', () => errorBody(404, 'RES_001', 'Không tìm thấy')),
    );
    renderTab();

    expect(await screen.findByText('Không tải được danh sách lời mời')).toBeInTheDocument();
    const card = screen.getByText('Lời mời đang chờ').parentElement as HTMLElement;
    expect(card).toHaveTextContent('—');
    // Bảng thành viên vẫn hiện bình thường.
    expect(screen.getByText('Khách còn lâu')).toBeInTheDocument();
  });
});
