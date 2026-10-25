/**
 * Báo cáo COMPANY / JOB_OFFER trong kiểm duyệt (p6-08 admin.md §2.3, §4) — khối riêng trên trang chi tiết báo cáo + tab `reports` của `/recruiter`:
 * - COMPANY: ngữ cảnh hồ sơ (KHÔNG email/tên nhân sự), tạm ngưng dùng lại hộp thoại lý do của `recruiter`, 404 → nói rõ không "Thử lại";
 * - JOB_OFFER (D-06): KHÔNG tải nội dung khi chưa xác nhận (mỗi lần xem là một dòng nhật ký), thiếu `recruiter:approve` → chỉ có lời giải thích, thu hồi bắt lý do;
 * - Quyết định: chỉ "Bỏ qua" và "Cảnh cáo" (không khoá tài khoản HR / gỡ nội dung);
 * - tab `reports`: cố định `targetType` ∈ {JOB_OFFER, COMPANY}, công tắc đổi loại nằm trên URL.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRoomSubscriptions } from '@/core/socket';
import RecruiterReportsTab from '@/features/recruiter/components/RecruiterReportsTab';
import ReportDetailPage from '@/features/moderation/pages/ReportDetailPage';
import type { ReportDetail } from '@/features/moderation/types/moderation.types';
import type { ReportedOffer } from '@/features/moderation/types/recruiter-moderation.types';
import { availableActions } from '@/features/moderation/utils/report-actions';
import { scopeLabel } from '@/features/moderation/utils/report-links';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { fakeSocket } from '../moderation/fake-socket';
import {
  errorJson,
  makeDetail as makeReportDetail,
  makeGroup,
  okJson,
  pageMeta,
  renderRoutes,
  REPORT_ID,
  signIn,
} from '../moderation/moderation-fixtures';
import { COMPANY_ID, makeCompany, makeDetail as makeCompanyDetail } from './recruiter-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket: shared } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => shared) };
});

const OFFER_ID = '665f1c2e8a1b2c3d4e5f6c11';
const PERM_OPS = ['moderation:view', 'moderation:update', 'recruiter:view', 'recruiter:approve'];

let reportDetail: ReportDetail;
let companyStatus: 'APPROVED' | 'SUSPENDED' | 'PENDING' = 'APPROVED';
let companyGone = false;
let offer: ReportedOffer;
let offerGone = false;
let reportedCalls = 0;
let listParams: URLSearchParams[] = [];
let posts: Array<{ kind: 'suspend' | 'withdraw'; body: Record<string, unknown> }> = [];

const server = setupServer(
  http.get('*/admin/reports/:id', () => okJson(reportDetail)),
  http.get('*/audit-logs', () => okJson([], { nextCursor: null, hasMore: false, limit: 20 })),
  http.get('*/admin/companies/:id', () =>
    companyGone
      ? errorJson(404, 'RES_001', 'Không tìm thấy doanh nghiệp')
      : okJson(
          makeCompanyDetail({
            company: makeCompany({ status: companyStatus, statusReason: companyStatus === 'SUSPENDED' ? 'Spam hàng loạt' : null }),
            // Nhân sự có tên/email RIÊNG (không trùng tác giả trong fixture báo cáo) để khẳng định khối báo cáo không vẽ chúng.
            members: [{ userId: 'm1', name: 'Nhân Sự Ẩn Danh', email: 'nhan-su-an-danh@acme.vn', role: 'OWNER', joinedAt: '2026-09-20T02:00:00.000Z' }],
          }),
        ),
  ),
  http.post('*/admin/companies/:id/suspend', async ({ request }) => {
    posts.push({ kind: 'suspend', body: (await request.json()) as Record<string, unknown> });
    companyStatus = 'SUSPENDED';
    return okJson(makeCompany({ status: 'SUSPENDED' }));
  }),
  http.get('*/admin/job-offers/:id/reported', () => {
    reportedCalls += 1;
    return offerGone ? errorJson(404, 'RES_001', 'Không tìm thấy lời mời') : okJson(offer);
  }),
  http.post('*/admin/job-offers/:id/withdraw', async ({ request }) => {
    posts.push({ kind: 'withdraw', body: (await request.json()) as Record<string, unknown> });
    return okJson({ id: OFFER_ID, status: 'WITHDRAWN' });
  }),
  http.get('*/admin/reports', ({ request }) => {
    listParams.push(new URL(request.url).searchParams);
    return okJson([makeGroup({ targetType: 'JOB_OFFER', groupKey: `JOB_OFFER:${OFFER_ID}`, scope: { type: null, isPrivate: false }, workspace: undefined })], pageMeta(1));
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

function detailFor(targetType: 'COMPANY' | 'JOB_OFFER'): ReportDetail {
  const targetId = targetType === 'COMPANY' ? COMPANY_ID : OFFER_ID;
  return makeReportDetail({
    group: makeGroup({
      targetType,
      targetId,
      groupKey: `${targetType}:${targetId}`,
      reasons: ['SCAM'],
      scope: { type: null, isPrivate: false },
      workspace: undefined,
      handlerLevel: 'PLATFORM_ONLY',
    }),
    publicContent: undefined,
  });
}

beforeEach(() => {
  reportDetail = detailFor('COMPANY');
  companyStatus = 'APPROVED';
  companyGone = false;
  offerGone = false;
  reportedCalls = 0;
  listParams = [];
  posts = [];
  offer = {
    id: OFFER_ID,
    company: { id: COMPANY_ID, name: 'Công ty Acme' },
    title: 'Thực tập Frontend',
    message: 'Chào bạn,\nChúng tôi muốn mời bạn phỏng vấn.',
    employmentType: 'INTERNSHIP',
    location: 'Hà Nội',
    status: 'READ',
    sentAt: '2026-09-20T03:00:00.000Z',
  };
  fakeSocket.emit.mockClear();
  resetRoomSubscriptions();
  useToastStore.setState({ toasts: [] });
  signIn(PERM_OPS);
});

function renderDetail() {
  return renderRoutes(
    [
      { path: '/moderation', element: <output>hàng đợi</output> },
      { path: '/moderation/:id', element: <ReportDetailPage /> },
    ],
    [`/moderation/${REPORT_ID}`],
  );
}

describe('báo cáo COMPANY', () => {
  it('hiện ngữ cảnh doanh nghiệp (chữ, liên kết sang vận hành, website an toàn) và KHÔNG có email/tên nhân sự', async () => {
    renderDetail();

    expect(await screen.findByText('Doanh nghiệp bị báo cáo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Công ty Acme' })).toHaveAttribute('href', `/recruiter?tab=companies&status=all&companyId=${COMPANY_ID}`);
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://acme.vn' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Doanh nghiệp tuyển dụng')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('nhan-su-an-danh@acme.vn');
    expect(document.body.textContent).not.toContain('Nhân Sự Ẩn Danh');
  });

  it('tạm ngưng: hộp thoại lý do dùng chung với vận hành — < 10 ký tự không gọi API, đủ dài POST { reason } tới /suspend', async () => {
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Tạm ngưng doanh nghiệp' }));
    const dialog = await screen.findByRole('dialog', { name: /Tạm ngưng — Công ty Acme/ });

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'ngan');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạm ngưng doanh nghiệp' }));
    expect(await within(dialog).findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(posts).toEqual([]);

    await userEvent.clear(within(dialog).getByLabelText(/Lý do/));
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Nhiều sinh viên báo cáo lừa đảo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạm ngưng doanh nghiệp' }));

    await waitFor(() => expect(posts).toEqual([{ kind: 'suspend', body: { reason: 'Nhiều sinh viên báo cáo lừa đảo' } }]));
  });

  it('thiếu recruiter:approve → không có khối "Xử lý doanh nghiệp"', async () => {
    signIn(['moderation:view', 'moderation:update', 'recruiter:view']);
    renderDetail();

    await screen.findByText('Doanh nghiệp bị báo cáo');
    expect(screen.queryByText('Xử lý doanh nghiệp')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạm ngưng doanh nghiệp' })).not.toBeInTheDocument();
  });

  it('doanh nghiệp không còn (404) → nói rõ, KHÔNG có "Thử lại"', async () => {
    companyGone = true;
    renderDetail();

    expect(await screen.findByText('Doanh nghiệp không còn khả dụng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('khối Quyết định chỉ có "Bỏ qua" và "Cảnh cáo tác giả" — không khoá tài khoản, không gỡ nội dung', async () => {
    signIn([...PERM_OPS, 'user:update']);
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Bỏ qua' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cảnh cáo tác giả' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khoá tài khoản' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ nội dung' })).not.toBeInTheDocument();
  });
});

describe('báo cáo JOB_OFFER (D-06)', () => {
  beforeEach(() => {
    reportDetail = detailFor('JOB_OFFER');
  });

  it('CHƯA xác nhận → KHÔNG gọi API nội dung; xác nhận rồi mới tải và hiện tiêu đề + nội dung lời mời', async () => {
    renderDetail();

    expect(await screen.findByText('Nội dung lời mời thuộc phạm vi riêng tư')).toBeInTheDocument();
    expect(reportedCalls).toBe(0);
    expect(screen.queryByText('Thực tập Frontend')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Xem nội dung lời mời (được ghi nhật ký)' }));
    const confirm = await screen.findByRole('dialog', { name: 'Xem nội dung lời mời?' });
    expect(reportedCalls).toBe(0);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Xác nhận và xem' }));

    expect(await screen.findByText('Thực tập Frontend')).toBeInTheDocument();
    expect(screen.getByText(/Chúng tôi muốn mời bạn phỏng vấn/)).toBeInTheDocument();
    expect(screen.getByText('Đã xem')).toBeInTheDocument();
    expect(screen.getByText('Thực tập')).toBeInTheDocument();
    expect(reportedCalls).toBe(1);
    // D-06: chỉ nội dung lời mời — không thread trao đổi, không địa chỉ email nào của người nhận trên trang.
    expect(screen.queryByRole('list', { name: 'Tin nhắn trong lời mời' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/S+@S+.S+/);
  });

  it('thiếu recruiter:approve → chỉ có lời giải thích, KHÔNG có nút xem và KHÔNG gọi API', async () => {
    signIn(['moderation:view', 'moderation:update', 'recruiter:view']);
    renderDetail();

    expect(await screen.findByText('Nội dung lời mời thuộc phạm vi riêng tư')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xem nội dung lời mời/ })).not.toBeInTheDocument();
    expect(reportedCalls).toBe(0);
  });

  it('thu hồi: bắt lý do ≥ 10 ký tự, POST { reason }, trạng thái đổi "Đã thu hồi" TẠI CHỖ (không tải lại nội dung — mỗi lần tải là một dòng nhật ký)', async () => {
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Xem nội dung lời mời (được ghi nhật ký)' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Xem nội dung lời mời?' })).getByRole('button', { name: 'Xác nhận và xem' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Thu hồi lời mời' }));
    const dialog = await screen.findByRole('dialog', { name: /Thu hồi lời mời — Công ty Acme/ });
    expect(within(dialog).getByText(/không hoàn lại lượt gửi/)).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'ngan');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thu hồi lời mời' }));
    expect(await within(dialog).findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(posts).toEqual([]);

    await userEvent.clear(within(dialog).getByLabelText(/Lý do/));
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Nội dung lừa đảo tuyển dụng');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thu hồi lời mời' }));

    await waitFor(() => expect(posts).toEqual([{ kind: 'withdraw', body: { reason: 'Nội dung lừa đảo tuyển dụng' } }]));
    expect(await screen.findByText('Đã thu hồi')).toBeInTheDocument();
    expect(reportedCalls).toBe(1);
    // Lời mời đã đóng → không còn nút thu hồi.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Thu hồi lời mời' })).not.toBeInTheDocument());
  });

  it('lời mời đã đóng (đã từ chối) → không có nút thu hồi', async () => {
    offer = { ...offer, status: 'DECLINED' };
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Xem nội dung lời mời (được ghi nhật ký)' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Xem nội dung lời mời?' })).getByRole('button', { name: 'Xác nhận và xem' }));

    expect(await screen.findByText('Thực tập Frontend')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thu hồi lời mời' })).not.toBeInTheDocument();
  });

  it('lời mời không còn (404) → nói rõ, KHÔNG có "Thử lại"', async () => {
    offerGone = true;
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Xem nội dung lời mời (được ghi nhật ký)' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Xem nội dung lời mời?' })).getByRole('button', { name: 'Xác nhận và xem' }));

    expect(await screen.findByText('Lời mời không còn khả dụng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});

describe('tab reports của /recruiter', () => {
  it('mặc định lọc JOB_OFFER + trạng thái OPEN; công tắc "Doanh nghiệp" đổi targetType trên URL và request', async () => {
    signIn(PERM_OPS);
    const { router } = renderRoutes([{ path: '/recruiter', element: <RecruiterReportsTab /> }], ['/recruiter?tab=reports']);

    await waitFor(() => expect(listParams.length).toBeGreaterThan(0));
    expect(listParams[0].get('targetType')).toBe('JOB_OFFER');
    expect(listParams[0].get('status')).toBe('OPEN');
    // Bảng dùng lại hàng đợi của moderation — nhãn loại đích tiếng Việt.
    expect(await screen.findByText('Lời mời việc làm')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Doanh nghiệp' }));
    await waitFor(() => expect(router.state.location.search).toContain('targetType=COMPANY'));
    await waitFor(() => expect(listParams.some((p) => p.get('targetType') === 'COMPANY')).toBe(true));
  });
});

describe('tiện ích', () => {
  it('availableActions cho COMPANY/JOB_OFFER: chỉ Cảnh cáo + Bỏ qua, kể cả khi có quyền khoá tài khoản', () => {
    for (const targetType of ['COMPANY', 'JOB_OFFER'] as const) {
      const group = makeGroup({ targetType, scope: { type: null, isPrivate: false } });
      expect(availableActions(group, { canUpdate: true, canLockUser: true })).toEqual(['WARN_AUTHOR', 'DISMISS']);
      expect(availableActions(group, { canUpdate: false, canLockUser: true })).toEqual([]);
    }
  });

  it('scopeLabel của COMPANY/JOB_OFFER là nhãn riêng, không rơi về "Nhóm chat"', () => {
    expect(scopeLabel(makeGroup({ targetType: 'COMPANY', scope: { type: null, isPrivate: false }, workspace: undefined }))).toBe('Doanh nghiệp tuyển dụng');
    expect(scopeLabel(makeGroup({ targetType: 'JOB_OFFER', scope: { type: null, isPrivate: false }, workspace: undefined }))).toBe('Lời mời tuyển dụng');
  });
});
