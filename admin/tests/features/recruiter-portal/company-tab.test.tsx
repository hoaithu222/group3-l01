/**
 * Tab Công ty (p6-08 admin.md §2.7, §4): tên/MST/website KHOÁ khi đã duyệt, PATCH chỉ trường ĐỔI kèm `expectedVersion`, `RES_003` giữ nội dung đang nhập,
 * "Gửi duyệt lại" khi bị từ chối (OWNER), thành viên (thêm/gỡ — OWNER; không tự gỡ mình), hạn mức tháng.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RecruiterPortalPage from '@/features/recruiter-portal/pages/RecruiterPortalPage';
import type { MyCompany } from '@/features/recruiter-portal/types/portal.types';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { cursorMeta, errorBody, HR_ID, makeMe, okBody, renderAt, signInHr } from './portal-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

interface Call {
  kind: 'patch' | 'resubmit' | 'add' | 'remove';
  body?: Record<string, unknown>;
  path?: string;
}

const OTHER_ID = '665f1c2e8a1b2c3d4e5f6d55';
let me: MyCompany;
let calls: Call[] = [];
let patchFailure: { status: number; code: string } | null = null;
let addFailure: { status: number; code: string } | null = null;

const server = setupServer(
  http.get('*/me/company', () => okBody(me)),
  http.get('*/companies/:id/talent/search', () => okBody([], cursorMeta())),
  http.get('*/skills', () => okBody([])),
  http.get('*/companies/:id/usage', () => okBody({ period: '2026-09', used: 1, quota: 5, remaining: 4, tier: 'FREE' })),
  http.get('*/companies/:id/members', () =>
    okBody([
      { userId: HR_ID, name: 'HR Acme', email: 'hr@acme.vn', role: 'OWNER', joinedAt: '2026-09-20T02:00:00.000Z' },
      { userId: OTHER_ID, name: 'Trần Thị Bình', email: 'binh@acme.vn', role: 'RECRUITER', joinedAt: '2026-09-21T02:00:00.000Z' },
    ]),
  ),
  http.patch('*/companies/:id', async ({ request }) => {
    calls.push({ kind: 'patch', body: (await request.json()) as Record<string, unknown> });
    if (patchFailure) return errorBody(patchFailure.status, patchFailure.code, 'Dữ liệu đã thay đổi');
    return okBody({ ...me.company, version: me.company.version + 1 });
  }),
  http.post('*/companies/:id/resubmit', () => {
    calls.push({ kind: 'resubmit' });
    return okBody({ ...me.company, status: 'PENDING' });
  }),
  http.post('*/companies/:id/members', async ({ request }) => {
    calls.push({ kind: 'add', body: (await request.json()) as Record<string, unknown> });
    if (addFailure) return errorBody(addFailure.status, addFailure.code, 'Người dùng này đã thuộc doanh nghiệp khác');
    return okBody({ userId: 'new', name: 'Mới', email: 'moi@acme.vn', role: 'RECRUITER', joinedAt: '2026-09-22T02:00:00.000Z' });
  }),
  http.delete('*/companies/:id/members/:userId', ({ params }) => {
    calls.push({ kind: 'remove', path: String(params.userId) });
    return okBody({ removed: true });
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
  me = makeMe('APPROVED', 'OWNER');
  calls = [];
  patchFailure = null;
  addFailure = null;
  useToastStore.setState({ toasts: [] });
  signInHr();
});

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const OPEN = '/recruiter/portal?tab=company';

describe('hồ sơ doanh nghiệp', () => {
  it('đã duyệt → tên/website/MST BỊ KHOÁ kèm lý do; mô tả/ngành/quy mô sửa được', async () => {
    renderAt(<RecruiterPortalPage />, OPEN);

    expect(await screen.findByLabelText(/Tên doanh nghiệp/)).toBeDisabled();
    expect(screen.getByLabelText(/Website/)).toBeDisabled();
    expect(screen.getByLabelText(/Mã số thuế/)).toBeDisabled();
    expect(screen.getAllByText(/liên hệ vận hành để thay đổi/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Giới thiệu/)).toBeEnabled();
  });

  it('lưu KHÔNG có thay đổi → toast "không có thay đổi", không gọi PATCH', async () => {
    renderAt(<RecruiterPortalPage />, OPEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Lưu hồ sơ' }));

    await waitFor(() => expect(toastTitles()).toContain('Hồ sơ không có thay đổi để lưu'));
    expect(calls).toEqual([]);
  });

  it('sửa mô tả → PATCH CHỈ trường đổi + expectedVersion (không gửi tên/website/MST đã khoá)', async () => {
    renderAt(<RecruiterPortalPage />, OPEN);
    const description = await screen.findByLabelText(/Giới thiệu/);
    await userEvent.clear(description);
    await userEvent.type(description, 'Công ty phần mềm tuyển dụng');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

    await waitFor(() => expect(calls.filter((c) => c.kind === 'patch')).toHaveLength(1));
    expect(calls[0].body).toEqual({ expectedVersion: 7, description: 'Công ty phần mềm tuyển dụng' });
    await waitFor(() => expect(toastTitles()).toContain('Đã lưu hồ sơ doanh nghiệp'));
  });

  it('RES_003 (người khác vừa sửa) → banner cảnh báo và GIỮ nguyên nội dung đang nhập', async () => {
    patchFailure = { status: 409, code: 'RES_003' };
    renderAt(<RecruiterPortalPage />, OPEN);
    const description = await screen.findByLabelText(/Giới thiệu/);
    await userEvent.clear(description);
    await userEvent.type(description, 'Nội dung tôi đang soạn');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

    expect(await screen.findByText('Dữ liệu đã thay đổi')).toBeInTheDocument();
    expect(screen.getByLabelText(/Giới thiệu/)).toHaveValue('Nội dung tôi đang soạn');
  });

  it('bị TỪ CHỐI (OWNER) → tên sửa được; "Gửi duyệt lại" gọi POST /resubmit', async () => {
    me = makeMe('REJECTED', 'OWNER', 'Website không truy cập được');
    renderAt(<RecruiterPortalPage />, OPEN);

    expect(await screen.findByLabelText(/Tên doanh nghiệp/)).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi duyệt lại' }));

    await waitFor(() => expect(calls.filter((c) => c.kind === 'resubmit')).toHaveLength(1));
    await waitFor(() => expect(toastTitles()).toContain('Đã gửi duyệt lại — chúng tôi sẽ xác minh trong 1–2 ngày làm việc'));
  });

  it('không phải OWNER → hồ sơ chỉ đọc: không "Lưu hồ sơ", không "Thêm thành viên", không "Gỡ"', async () => {
    me = makeMe('APPROVED', 'RECRUITER');
    renderAt(<RecruiterPortalPage />, OPEN);

    await screen.findByText('Trần Thị Bình');
    expect(screen.queryByRole('button', { name: 'Lưu hồ sơ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm thành viên' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ' })).not.toBeInTheDocument();
  });
});

describe('gói & hạn mức', () => {
  it('hiện đã dùng/hạn mức, ngày làm mới và "Nâng gói: liên hệ"', async () => {
    renderAt(<RecruiterPortalPage />, OPEN);

    expect(await screen.findByText(/Đã dùng 1\/5 lời mời tháng 09\/2026 — còn 4 lượt\. Làm mới ngày 01\/10\/2026\./)).toBeInTheDocument();
    expect(screen.getByText(/Nâng gói: liên hệ đội hỗ trợ/)).toBeInTheDocument();
    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
  });
});

describe('thành viên', () => {
  it('OWNER thêm thành viên: POST { email chuẩn hoá, role }; RECR_011 → modal giữ mở', async () => {
    renderAt(<RecruiterPortalPage />, OPEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm thành viên' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thêm thành viên' });

    await userEvent.type(within(dialog).getByLabelText(/Email/), 'khong-hop-le');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm thành viên' }));
    expect(await within(dialog).findByText('Email không đúng định dạng')).toBeInTheDocument();
    expect(calls).toEqual([]);

    addFailure = { status: 409, code: 'RECR_011' };
    await userEvent.clear(within(dialog).getByLabelText(/Email/));
    await userEvent.type(within(dialog).getByLabelText(/Email/), 'nguoi-khac@congty.vn');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm thành viên' }));

    await waitFor(() => expect(calls.filter((c) => c.kind === 'add')).toHaveLength(1));
    expect(calls[0].body).toEqual({ email: 'nguoi-khac@congty.vn', role: 'RECRUITER' });
    expect(screen.getByRole('dialog', { name: 'Thêm thành viên' })).toBeInTheDocument();
  });

  it('gỡ thành viên cần xác nhận; hàng của CHÍNH MÌNH không có nút "Gỡ"', async () => {
    renderAt(<RecruiterPortalPage />, OPEN);
    await screen.findByText('Trần Thị Bình');

    const buttons = screen.getAllByRole('button', { name: 'Gỡ' });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    const confirm = await screen.findByRole('dialog', { name: 'Gỡ thành viên?' });
    expect(calls).toEqual([]);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Gỡ thành viên' }));

    await waitFor(() => expect(calls).toEqual([{ kind: 'remove', path: OTHER_ID }]));
  });

  it('doanh nghiệp chưa được duyệt → KHÔNG có "Thêm thành viên" (BE yêu cầu APPROVED)', async () => {
    me = makeMe('PENDING', 'OWNER');
    renderAt(<RecruiterPortalPage />, OPEN);

    await screen.findByText('Trần Thị Bình');
    expect(screen.queryByRole('button', { name: 'Thêm thành viên' })).not.toBeInTheDocument();
  });
});
