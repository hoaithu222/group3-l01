/**
 * Ngăn kéo doanh nghiệp + hành động vận hành (p6-08 admin.md §2.1, §4):
 * - Duyệt / Từ chối / Tạm ngưng / Khôi phục bắt lý do ≥ 10 ký tự (KHÔNG gọi API khi thiếu), nút hiện theo TRẠNG THÁI và QUYỀN;
 * - `manager` (thiếu `recruiter:update`) KHÔNG thấy "Đổi gói / hạn mức" và "Sửa thông tin"; admin thấy và PATCH kèm `expectedVersion`;
 * - `RECR_009` (người khác vừa đổi trạng thái) → đóng hộp thoại thay vì kẹt;
 * - riêng tư: ngăn kéo không có email/tên ứng viên; email nhân sự chỉ hiện với `user:view`; cảnh báo tên miền email khác website.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RecruiterOpsPage from '@/features/recruiter/pages/RecruiterOpsPage';
import type { AdminCompanyDetail } from '@/features/recruiter/types/recruiter.types';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import {
  COMPANY_ID,
  errorBody,
  makeCompany,
  makeDetail,
  makeItem,
  okBody,
  pageMeta,
  PERM_APPROVE,
  PERM_UPDATE,
  PERM_VIEW,
  renderAt,
  signInOps,
} from './recruiter-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let detail: AdminCompanyDetail;
let calls: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
let actionFailure: { status: number; code: string } | null = null;

const server = setupServer(
  http.get('*/admin/companies/:id', () => okBody(detail)),
  http.get('*/admin/companies', () => okBody([makeItem({ status: detail.company.status })], pageMeta(1))),
  http.get('*/audit-logs', () => okBody([], { nextCursor: null, hasMore: false, limit: 20 })),
  http.post('*/admin/companies/:id/:action', async ({ request, params }) => {
    calls.push({ path: `${String(params.action)}`, method: 'POST', body: (await request.json()) as Record<string, unknown> });
    if (actionFailure) return errorBody(actionFailure.status, actionFailure.code, 'Trạng thái hiện tại không cho phép thao tác này');
    return okBody(detail.company);
  }),
  http.patch('*/admin/companies/:id', async ({ request }) => {
    calls.push({ path: 'patch', method: 'PATCH', body: (await request.json()) as Record<string, unknown> });
    return okBody({ ...detail.company, version: detail.company.version + 1 });
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
  detail = makeDetail();
  calls = [];
  actionFailure = null;
  useToastStore.setState({ toasts: [] });
  signInOps(PERM_APPROVE);
});

const URL_WITH_DRAWER = `/recruiter?status=all&companyId=${COMPANY_ID}`;
const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

async function openDrawer() {
  renderAt(<RecruiterOpsPage />, URL_WITH_DRAWER);
  return screen.findByRole('dialog', { name: /Công ty Acme/ });
}

describe('duyệt / từ chối — bắt lý do', () => {
  it('lý do < 10 ký tự → báo lỗi, KHÔNG gọi API; đủ dài → POST { reason } tới /approve', async () => {
    await openDrawer();
    await userEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    const dialog = await screen.findByRole('dialog', { name: /Duyệt — Công ty Acme/ });

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'ngan qua');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duyệt doanh nghiệp' }));
    expect(await within(dialog).findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(calls).toEqual([]);

    await userEvent.clear(within(dialog).getByLabelText(/Lý do/));
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Đã đối chiếu website và MST hợp lệ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duyệt doanh nghiệp' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: 'approve', method: 'POST', body: { reason: 'Đã đối chiếu website và MST hợp lệ' } });
    await waitFor(() => expect(toastTitles()).toContain('Đã duyệt doanh nghiệp và ghi nhật ký'));
  });

  it('Từ chối: nêu rõ lý do được gửi cho doanh nghiệp, POST tới /reject', async () => {
    await openDrawer();
    await userEvent.click(await screen.findByRole('button', { name: 'Từ chối' }));
    const dialog = await screen.findByRole('dialog', { name: /Từ chối — Công ty Acme/ });
    expect(within(dialog).getByText(/Lý do bên dưới được gửi cho doanh nghiệp/)).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Website không truy cập được');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Từ chối doanh nghiệp' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].path).toBe('reject');
  });
});

describe('tạm ngưng / khôi phục — theo trạng thái', () => {
  it('doanh nghiệp ĐÃ DUYỆT → chỉ có "Tạm ngưng" (không Duyệt/Từ chối); hộp thoại nêu số phận lời mời đang mở; bắt lý do', async () => {
    detail = makeDetail({ company: makeCompany({ status: 'APPROVED' }) });
    await openDrawer();

    expect(await screen.findByRole('button', { name: 'Tạm ngưng' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tạm ngưng' }));
    const dialog = await screen.findByRole('dialog', { name: /Tạm ngưng — Công ty Acme/ });
    expect(within(dialog).getByText(/lời mời đang mở/)).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'ngan');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạm ngưng doanh nghiệp' }));
    expect(await within(dialog).findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(calls).toEqual([]);

    await userEvent.clear(within(dialog).getByLabelText(/Lý do/));
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Nhiều báo cáo spam từ sinh viên');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạm ngưng doanh nghiệp' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].path).toBe('suspend');
  });

  it('doanh nghiệp TẠM NGƯNG → chỉ có "Khôi phục"', async () => {
    detail = makeDetail({ company: makeCompany({ status: 'SUSPENDED', statusReason: 'Vi phạm điều khoản' }) });
    await openDrawer();

    expect(await screen.findByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạm ngưng' })).not.toBeInTheDocument();
    // Lý do lần xử lý gần nhất hiện ở tab Thông tin.
    expect(screen.getByText('Vi phạm điều khoản')).toBeInTheDocument();
  });

  it('doanh nghiệp bị TỪ CHỐI → không nút đổi trạng thái nào (chờ doanh nghiệp gửi lại)', async () => {
    detail = makeDetail({ company: makeCompany({ status: 'REJECTED' }) });
    await openDrawer();

    await screen.findByText('Phần mềm tuyển dụng');
    for (const name of ['Duyệt', 'Từ chối', 'Tạm ngưng', 'Khôi phục']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('RECR_009 (người khác vừa đổi trạng thái) → hộp thoại ĐÓNG, không kẹt', async () => {
    actionFailure = { status: 409, code: 'RECR_009' };
    await openDrawer();
    await userEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    const dialog = await screen.findByRole('dialog', { name: /Duyệt — Công ty Acme/ });

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Đã đối chiếu website và MST hợp lệ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duyệt doanh nghiệp' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Duyệt — Công ty Acme/ })).not.toBeInTheDocument());
  });
});

describe('quyền', () => {
  it('chỉ recruiter:view → không nút hành động nào', async () => {
    signInOps(PERM_VIEW);
    await openDrawer();

    await screen.findByText('Phần mềm tuyển dụng');
    for (const name of ['Duyệt', 'Từ chối', 'Đổi gói / hạn mức', 'Sửa thông tin']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('manager (recruiter:approve, KHÔNG update) → thấy Duyệt/Từ chối nhưng KHÔNG thấy "Đổi gói / hạn mức"', async () => {
    signInOps(PERM_APPROVE);
    await openDrawer();

    expect(await screen.findByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đổi gói / hạn mức' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa thông tin' })).not.toBeInTheDocument();
  });

  it('admin (recruiter:update) → "Đổi gói / hạn mức": PATCH kèm expectedVersion, tier, hạn mức trống = null và lý do', async () => {
    signInOps(PERM_UPDATE);
    await openDrawer();
    await userEvent.click(await screen.findByRole('button', { name: 'Đổi gói / hạn mức' }));
    const dialog = await screen.findByRole('dialog', { name: /Đổi gói \/ hạn mức — Công ty Acme/ });

    await userEvent.click(within(dialog).getByRole('combobox', { name: /Gói/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Pro' }));
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'ngan');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu gói / hạn mức' }));
    expect(await within(dialog).findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(calls).toEqual([]);

    await userEvent.clear(within(dialog).getByLabelText(/Lý do/));
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Nâng gói theo hợp đồng đã ký');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu gói / hạn mức' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: 'patch',
      method: 'PATCH',
      body: { expectedVersion: 4, tier: 'PRO', offerQuotaOverride: null, reason: 'Nâng gói theo hợp đồng đã ký' },
    });
  });
});

describe('riêng tư', () => {
  it('KHÔNG có email/tên ứng viên nhận lời mời trong ngăn kéo (kể cả khi BE lỡ trả kèm) — chỉ số đếm theo trạng thái', async () => {
    detail = {
      ...makeDetail(),
      // BE KHÔNG trả các trường này; test khẳng định giao diện cũng không vẽ chúng nếu có lỡ lọt vào.
      students: [{ name: 'Sinh viên Bí Mật', email: 'sv-bi-mat@x.vn' }],
      offers: [{ title: 'Nội dung lời mời riêng tư', studentName: 'Sinh viên Bí Mật' }],
    } as AdminCompanyDetail;
    await openDrawer();
    await screen.findByText('Phần mềm tuyển dụng');
    await userEvent.click(screen.getByRole('tab', { name: 'Sử dụng' }));

    expect(await screen.findByText('Lời mời theo trạng thái (mọi thời điểm)')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Sinh viên Bí Mật');
    expect(document.body.textContent).not.toContain('sv-bi-mat@x.vn');
    expect(document.body.textContent).not.toContain('Nội dung lời mời riêng tư');
  });

  it('email nhân sự CHỈ hiện với user:view; thiếu quyền thì cột Email không tồn tại', async () => {
    signInOps([...PERM_APPROVE]);
    await openDrawer();
    await screen.findByText('Phần mềm tuyển dụng');
    await userEvent.click(screen.getByRole('tab', { name: 'Thành viên' }));
    expect(await screen.findByText('Nguyễn Văn An')).toBeInTheDocument();
    expect(screen.queryByText('an@acme.vn')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Email' })).not.toBeInTheDocument();
  });

  it('có user:view → thấy email nhân sự và tên là liên kết sang hồ sơ người dùng', async () => {
    signInOps([...PERM_APPROVE, 'user:view']);
    await openDrawer();
    await screen.findByText('Phần mềm tuyển dụng');
    await userEvent.click(screen.getByRole('tab', { name: 'Thành viên' }));

    expect(await screen.findByText('an@acme.vn')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nguyễn Văn An' })).toHaveAttribute('href', expect.stringMatching(/^\/user\//));
  });

  it('email chủ sở hữu KHÁC tên miền website → cảnh báo; cùng tên miền → không cảnh báo', async () => {
    detail = makeDetail({
      members: [{ userId: 'o1', name: 'An', email: 'an@gmail.com', role: 'OWNER', joinedAt: '2026-09-20T02:00:00.000Z' }],
    });
    const first = renderAt(<RecruiterOpsPage />, URL_WITH_DRAWER);
    expect(await screen.findByText('Tên miền email khác website')).toBeInTheDocument();
    first.unmount();

    detail = makeDetail();
    renderAt(<RecruiterOpsPage />, URL_WITH_DRAWER);
    await screen.findByText('Phần mềm tuyển dụng');
    expect(screen.queryByText('Tên miền email khác website')).not.toBeInTheDocument();
  });

  it('website không phải http(s) (javascript:) → KHÔNG là liên kết', async () => {
    detail = makeDetail({ company: makeCompany({ website: 'javascript:alert(1)' }) });
    await openDrawer();
    await screen.findByText('Phần mềm tuyển dụng');

    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument();
  });
});
