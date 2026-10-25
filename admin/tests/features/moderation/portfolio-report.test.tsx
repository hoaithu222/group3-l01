/**
 * Kiểm duyệt PORTFOLIO (p6-07): báo cáo `PORTFOLIO` trên trang chi tiết moderation.
 * - ngữ cảnh hồ sơ (CHỈ metadata: tên, đường dẫn, trạng thái bằng chữ, liên kết công khai an toàn, thông tin gỡ);
 * - gỡ: lý do ≥ 10 ký tự mới gửi `{ reason, reportGroupKey }`, thành công → "Đã bị gỡ" + toast nhật ký + hiện "Mở lại";
 * - mở lại: `{ reason }`; `PORT_012` (đã có người mở lại) đồng bộ giao diện thay vì kẹt modal;
 * - `moderation:view` thôi → không thấy nút; hành động báo cáo theo loại đích (có cảnh cáo/khoá tác giả, không "Gỡ nội dung").
 *
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
import type { ReportDetail } from '@/features/moderation/types/moderation.types';
import type { AdminPortfolio } from '@/features/moderation/types/portfolio-moderation.types';
import { portfolioStatusMeta, safePublicUrl } from '@/features/moderation/utils/portfolio-status';
import { availableActions } from '@/features/moderation/utils/report-actions';
import { scopeLabel } from '@/features/moderation/utils/report-links';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { fakeSocket } from './fake-socket';
import {
  AUTHOR_ID,
  errorJson,
  makeDetail,
  makeGroup,
  okJson,
  PERM_MODERATE_LOCK,
  PERM_VIEW,
  renderRoutes,
  REPORT_ID,
  signIn,
} from './moderation-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket: shared } = await import('./fake-socket');
  return { io: vi.fn(() => shared) };
});

const PORTFOLIO_ID = '665f1c2e8a1b2c3d4e5f6c01';
const NOW = '2026-09-21T03:00:00.000Z';

function makePortfolio(over: Partial<AdminPortfolio> = {}): AdminPortfolio {
  return {
    id: PORTFOLIO_ID,
    userId: AUTHOR_ID,
    slug: 'nguyen-van-an',
    displayName: 'Nguyễn Văn An',
    status: 'PUBLISHED',
    publicUrl: 'https://superapp.vcijsc.com/p/nguyen-van-an',
    takenDownAt: null,
    takenDownBy: null,
    takedownReason: null,
    publishedAt: '2026-09-10T02:00:00.000Z',
    version: 3,
    ...over,
  };
}

let detail: ReportDetail;
let portfolio: AdminPortfolio;
let decisionCalls: Array<{ kind: 'takedown' | 'restore'; body: Record<string, unknown> }> = [];
/** Khác `undefined` ⇒ POST restore trả lỗi này (và hồ sơ đổi trạng thái như thể người khác vừa mở lại). */
let restoreFailure: { status: number; code: string; message: string } | undefined;

const server = setupServer(
  http.get('*/admin/reports/:id', () => okJson(detail)),
  http.get('*/audit-logs', () => okJson([], { nextCursor: null, hasMore: false, limit: 20 })),
  http.get('*/admin/portfolios/:id', () => okJson(portfolio)),
  http.post('*/admin/portfolios/:id/takedown', async ({ request }) => {
    decisionCalls.push({
      kind: 'takedown',
      body: (await request.json()) as Record<string, unknown>,
    });
    portfolio = {
      ...portfolio,
      publicUrl: null,
      takenDownAt: NOW,
      takenDownBy: 'admin-1',
      takedownReason: 'Giả mạo tổ chức',
    };
    return okJson(portfolio);
  }),
  http.post('*/admin/portfolios/:id/restore', async ({ request }) => {
    decisionCalls.push({ kind: 'restore', body: (await request.json()) as Record<string, unknown> });
    if (restoreFailure) {
      portfolio = { ...portfolio, takenDownAt: null, takenDownBy: null, takedownReason: null };
      return errorJson(restoreFailure.status, restoreFailure.code, restoreFailure.message);
    }
    portfolio = { ...portfolio, takenDownAt: null, takenDownBy: null, takedownReason: null };
    return okJson(portfolio);
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

function portfolioDetail(): ReportDetail {
  return makeDetail({
    group: makeGroup({
      targetType: 'PORTFOLIO',
      targetId: PORTFOLIO_ID,
      groupKey: `PORTFOLIO:${PORTFOLIO_ID}`,
      reasons: ['IMPERSONATION'],
      scope: { type: null, isPrivate: false },
      workspace: undefined,
      handlerLevel: 'PLATFORM_ONLY',
    }),
    reports: [
      {
        id: REPORT_ID,
        reporter: { id: 'r-1', name: 'Trần Thị Bình' },
        reason: 'IMPERSONATION',
        description: 'Mạo danh nhân viên công ty',
        status: 'OPEN',
        createdAt: NOW,
      },
    ],
    publicContent: undefined,
  });
}

beforeEach(() => {
  detail = portfolioDetail();
  portfolio = makePortfolio();
  decisionCalls = [];
  restoreFailure = undefined;
  fakeSocket.emit.mockClear();
  resetRoomSubscriptions();
  useToastStore.setState({ toasts: [] });
  signIn([...PERM_MODERATE_LOCK, 'user:view']);
});

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

function renderDetail() {
  return renderRoutes(
    [
      { path: '/moderation', element: <output data-testid="queue">hàng đợi</output> },
      { path: '/moderation/:id', element: <ReportDetailPage /> },
    ],
    [`/moderation/${REPORT_ID}`],
  );
}

describe('báo cáo PORTFOLIO — ngữ cảnh', () => {
  it('hiện tên, đường dẫn, trạng thái bằng CHỮ, chủ hồ sơ có liên kết (user:view) và liên kết mở trang công khai an toàn', async () => {
    renderDetail();

    expect(await screen.findByText('Portfolio bị báo cáo')).toBeInTheDocument();
    expect(screen.getByText('/p/nguyen-van-an')).toBeInTheDocument();
    expect(screen.getByText('Đang công khai')).toBeInTheDocument();
    // Loại đích + lý do có nhãn tiếng Việt (không rơi về mã thô).
    expect(screen.getAllByText('Portfolio').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mạo danh').length).toBeGreaterThan(0);
    expect(screen.getByText('Trang portfolio công khai')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Nguyễn Văn An' })) {
      expect(link).toHaveAttribute('href', `/user/${AUTHOR_ID}`);
    }
    const open = screen.getByRole('link', { name: 'Mở trang công khai' });
    expect(open).toHaveAttribute('href', 'https://superapp.vcijsc.com/p/nguyen-van-an');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('hồ sơ đã bị gỡ → "Đã bị gỡ", lý do + thời điểm, KHÔNG có liên kết công khai, nút "Mở lại"', async () => {
    portfolio = makePortfolio({
      publicUrl: null,
      takenDownAt: NOW,
      takenDownBy: 'admin-1',
      takedownReason: 'Giả mạo tổ chức',
    });
    renderDetail();

    expect(await screen.findByText('Đã bị gỡ (vi phạm)')).toBeInTheDocument();
    expect(screen.getByText('Lý do: Giả mạo tổ chức')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mở trang công khai' })).not.toBeInTheDocument();
    expect(screen.getByText('Không còn công khai')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Mở lại portfolio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ portfolio' })).not.toBeInTheDocument();
  });

  it('BE lỡ trả liên kết không phải http(s) (javascript:) → KHÔNG dùng làm href', async () => {
    portfolio = makePortfolio({ publicUrl: 'javascript:alert(1)' });
    renderDetail();

    await screen.findByText('Portfolio bị báo cáo');
    expect(screen.queryByRole('link', { name: 'Mở trang công khai' })).not.toBeInTheDocument();
    expect(screen.getByText('Không còn công khai')).toBeInTheDocument();
  });

  it('KHÔNG có nội dung hồ sơ (giới thiệu, dự án, số liệu) dù BE lỡ trả kèm', async () => {
    server.use(
      http.get('*/admin/portfolios/:id', () =>
        okJson({ ...portfolio, bio: 'Tiểu sử riêng tư — BÍ-MẬT', projects: [{ name: 'Dự án bí mật' }] }),
      ),
    );
    renderDetail();

    await screen.findByText('Portfolio bị báo cáo');
    expect(document.body.textContent).not.toContain('BÍ-MẬT');
    expect(document.body.textContent).not.toContain('Dự án bí mật');
  });
});

describe('gỡ / mở lại portfolio', () => {
  async function openTakedown() {
    await screen.findByText('Xử lý portfolio');
    await userEvent.click(await screen.findByRole('button', { name: 'Gỡ portfolio' }));
    return screen.findByRole('dialog');
  }

  it('lý do < 10 ký tự → báo lỗi, KHÔNG gọi API', async () => {
    renderDetail();
    const dialog = await openTakedown();

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'ngan qua');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gỡ portfolio' }));

    expect(await within(dialog).findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(decisionCalls).toEqual([]);
  });

  it('gỡ: nêu tác động, gửi { reason, reportGroupKey }, thành công → "Đã bị gỡ" + toast nhật ký + hiện "Mở lại"', async () => {
    renderDetail();
    const dialog = await openTakedown();
    expect(within(dialog).getByText(/trả 404 NGAY/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Mọi báo cáo đang mở của hồ sơ được đóng/)).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Giả mạo tổ chức, nhiều báo cáo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gỡ portfolio' }));

    await waitFor(() => expect(decisionCalls).toHaveLength(1));
    expect(decisionCalls[0]).toEqual({
      kind: 'takedown',
      body: {
        reason: 'Giả mạo tổ chức, nhiều báo cáo',
        reportGroupKey: `PORTFOLIO:${PORTFOLIO_ID}`,
      },
    });
    expect(await screen.findByText('Đã bị gỡ (vi phạm)')).toBeInTheDocument();
    expect(toastTitles()).toContain('Đã gỡ portfolio, thông báo cho chủ hồ sơ và ghi nhật ký');
    expect(await screen.findByRole('button', { name: 'Mở lại portfolio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ portfolio' })).not.toBeInTheDocument();
  });

  it('mở lại: hồ sơ đang bị gỡ → gửi { reason } đến /restore, nói rõ KHÔNG tự công khai lại', async () => {
    portfolio = makePortfolio({
      publicUrl: null,
      takenDownAt: NOW,
      takedownReason: 'Giả mạo',
    });
    renderDetail();
    await screen.findByText('Xử lý portfolio');

    await userEvent.click(await screen.findByRole('button', { name: 'Mở lại portfolio' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/KHÔNG tự đăng lại/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Đã xác minh là hồ sơ thật');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mở lại' }));

    await waitFor(() => expect(decisionCalls).toHaveLength(1));
    expect(decisionCalls[0]).toEqual({ kind: 'restore', body: { reason: 'Đã xác minh là hồ sơ thật' } });
    await waitFor(() => expect(screen.queryByText('Đã bị gỡ (vi phạm)')).not.toBeInTheDocument());
    expect(toastTitles().some((t) => t?.includes('Đã mở lại portfolio'))).toBe(true);
  });

  it('PORT_012 (người khác vừa mở lại) → giao diện đồng bộ sang trạng thái không bị gỡ', async () => {
    portfolio = makePortfolio({ publicUrl: null, takenDownAt: NOW, takedownReason: 'Giả mạo' });
    restoreFailure = { status: 409, code: 'PORT_012', message: 'Hồ sơ không ở trạng thái bị gỡ' };
    renderDetail();
    await screen.findByText('Xử lý portfolio');

    await userEvent.click(await screen.findByRole('button', { name: 'Mở lại portfolio' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Đã xác minh là hồ sơ thật');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mở lại' }));

    // Sau khi làm mới, nút chuyển thành "Gỡ portfolio" (hồ sơ không còn bị gỡ).
    expect(await screen.findByRole('button', { name: 'Gỡ portfolio' })).toBeInTheDocument();
    expect(screen.queryByText('Đã bị gỡ (vi phạm)')).not.toBeInTheDocument();
  });

  it('chỉ có moderation:view → KHÔNG thấy khối gỡ/mở lại', async () => {
    signIn(PERM_VIEW);
    renderDetail();

    expect(await screen.findByText('Portfolio bị báo cáo')).toBeInTheDocument();
    await screen.findByText('Quyết định');
    expect(screen.queryByText('Xử lý portfolio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ portfolio' })).not.toBeInTheDocument();
  });
});

describe('báo cáo PORTFOLIO — trạng thái lỗi', () => {
  it('404 (hồ sơ không còn) → "Portfolio không còn khả dụng", KHÔNG có "Thử lại"; phần báo cáo vẫn dùng được', async () => {
    server.use(http.get('*/admin/portfolios/:id', () => errorJson(404, 'RES_001', 'Không tìm thấy')));
    renderDetail();

    expect(await screen.findByText('Portfolio không còn khả dụng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Bỏ qua' })).toBeInTheDocument();
  });

  it('lỗi 500 → Callout + "Thử lại"; thử lại khi BE hồi phục hiện hồ sơ', async () => {
    server.use(http.get('*/admin/portfolios/:id', () => errorJson(500, 'SYS_500', 'Lỗi máy chủ')));
    renderDetail();

    const title = await screen.findByText('Không tải được portfolio');
    server.use(http.get('*/admin/portfolios/:id', () => okJson(portfolio)));
    await userEvent.click(
      within(title.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Thử lại' }),
    );

    expect(await screen.findByText('Portfolio bị báo cáo')).toBeInTheDocument();
  });
});

describe('PORTFOLIO — hàm thuần', () => {
  it('loại đích có mặt trong ô lọc; phạm vi có nhãn riêng', () => {
    expect(REPORT_TARGET_TYPE_OPTIONS.find((o) => o.value === 'PORTFOLIO')?.label).toBe('Portfolio');
    expect(
      scopeLabel({
        targetType: 'PORTFOLIO',
        scope: { type: null, isPrivate: false },
        workspace: undefined,
      }),
    ).toBe('Trang portfolio công khai');
  });

  it('hành động báo cáo: có bỏ qua/cảnh cáo/khoá tác giả; KHÔNG "Gỡ nội dung tin nhắn"/lưu trữ kênh/giải tán nhóm', () => {
    const group = { targetType: 'PORTFOLIO' as const, scope: { type: null, isPrivate: false } };
    expect(availableActions(group, { canUpdate: true, canLockUser: true })).toEqual([
      'WARN_AUTHOR',
      'LOCK_AUTHOR',
      'DISMISS',
    ]);
    expect(availableActions(group, { canUpdate: true, canLockUser: false })).toEqual([
      'WARN_AUTHOR',
      'DISMISS',
    ]);
    expect(availableActions(group, { canUpdate: false, canLockUser: true })).toEqual([]);
  });

  it('portfolioStatusMeta: takenDownAt thắng trạng thái cũ; đủ nhãn chữ', () => {
    expect(portfolioStatusMeta({ status: 'PUBLISHED', takenDownAt: NOW }).label).toBe('Đã bị gỡ (vi phạm)');
    expect(portfolioStatusMeta({ status: 'PUBLISHED', takenDownAt: null }).label).toBe('Đang công khai');
    expect(portfolioStatusMeta({ status: 'UNPUBLISHED', takenDownAt: null }).label).toBe('Đã ngừng công khai');
    expect(portfolioStatusMeta({ status: 'DRAFT', takenDownAt: null }).label).toBe('Bản nháp');
  });

  it('safePublicUrl: chỉ http(s)', () => {
    expect(safePublicUrl('https://x.vn/p/a')).toBe('https://x.vn/p/a');
    expect(safePublicUrl('http://x.vn/p/a')).toBe('http://x.vn/p/a');
    expect(safePublicUrl('javascript:alert(1)')).toBeNull();
    expect(safePublicUrl('data:text/html,x')).toBeNull();
    expect(safePublicUrl('khong-phai-url')).toBeNull();
    expect(safePublicUrl(null)).toBeNull();
  });
});
