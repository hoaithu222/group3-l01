/**
 * `ReportDetailPage` — phần dữ liệu và KHỐI QUYẾT ĐỊNH (p1-08 admin.md §2.2, §4): ngữ cảnh/từng
 * báo cáo/lịch sử/thống kê tác giả, hành động hiển thị theo LOẠI ĐÍCH và QUYỀN, lý do ≥ 10 ký tự,
 * xử lý `409 MOD_001`, và nút quay lại giữ bộ lọc hàng đợi. Luồng xem nội dung riêng tư (D-06) ở
 * `private-content.test.tsx`.
 *
 * Mock ở tầng HTTP (MSW) — lỗi 409 đi qua axios interceptor thật, nên thông điệp tiếng Việt là kết
 * quả của `ERROR_CODE_MESSAGES`, không phải do test dựng.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRoomSubscriptions } from '@/core/socket';
import ReportDetailPage from '@/features/moderation/pages/ReportDetailPage';
import type { AdminReportGroup, ReportDetail } from '@/features/moderation/types/moderation.types';
import { useToastStore } from '@/shared/ui/overlays/toast-store';
import { HeaderSlotsHarness } from '@tests/shared/header-slots-harness';

import { fakeSocket } from './fake-socket';
import {
  errorJson,
  makeDetail,
  makeGroup,
  okJson,
  PERM_MODERATE,
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

let detail: ReportDetail;
let patchCalls: Array<{ path: string; body: Record<string, unknown> }> = [];
/** Khác `undefined` ⇒ PATCH trả lỗi này thay vì thành công. */
let patchFailure: { status: number; code: string; message: string } | undefined;

const server = setupServer(
  http.get('*/admin/reports/:id', () => okJson(detail)),
  http.get('*/audit-logs', () => okJson([], { nextCursor: null, hasMore: false, limit: 20 })),
  http.patch('*/admin/reports/:id', async ({ request }) => {
    patchCalls.push({
      path: new URL(request.url).pathname,
      body: (await request.json()) as Record<string, unknown>,
    });
    if (patchFailure) {
      // Người khác đã đóng nhóm trước — lần tải lại phải thấy trạng thái đã xử lý.
      detail = withGroup(detail, { status: 'RESOLVED', resolution: 'CONTENT_REMOVED' });
      return errorJson(patchFailure.status, patchFailure.code, patchFailure.message);
    }
    detail = withGroup(detail, { status: 'RESOLVED', resolution: 'CONTENT_REMOVED' });
    return okJson({
      groupKey: detail.group.groupKey,
      status: 'RESOLVED',
      resolution: 'CONTENT_REMOVED',
      closedCount: 3,
    });
  }),
);

function withGroup(base: ReportDetail, patch: Partial<AdminReportGroup>): ReportDetail {
  return { ...base, group: { ...base.group, ...patch } };
}

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
  patchCalls = [];
  patchFailure = undefined;
  fakeSocket.emit.mockClear();
  resetRoomSubscriptions();
  useToastStore.setState({ toasts: [] });
  signIn([...PERM_MODERATE_LOCK, 'user:view']);
});

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

function renderDetail(
  entry: string | { pathname: string; state?: unknown } = `/moderation/${REPORT_ID}`,
) {
  return renderRoutes(
    [
      { path: '/moderation', element: <output data-testid="queue">hàng đợi</output> },
      {
        path: '/moderation/:id',
        // Tiêu đề + nút quay lại nằm trên THANH HEADER (portal) — harness dựng đích portal cho page render riêng lẻ.
        element: (
          <HeaderSlotsHarness>
            <ReportDetailPage />
          </HeaderSlotsHarness>
        ),
      },
    ],
    [entry],
  );
}

/** Nút quay lại trên thanh header — chip có `backHref` nên là LINK thật (mở thẻ mới được), không còn là button. */
const backLink = () => within(screen.getByRole('banner')).getByRole('link', { name: 'Quay lại' });

const actionNames = () =>
  [
    'Gỡ nội dung',
    'Cảnh cáo tác giả',
    'Khoá tài khoản',
    'Lưu trữ kênh',
    'Giải tán nhóm chat',
    'Bỏ qua',
  ].filter((name) => screen.queryByRole('button', { name }) !== null);

describe('chi tiết — dữ liệu', () => {
  it('hiện ngữ cảnh, từng báo cáo (kèm người báo cáo), lịch sử và thống kê tác giả 30 ngày', async () => {
    renderDetail();

    expect(await screen.findByText('Ngữ cảnh')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nhóm Alpha' })).toHaveAttribute(
      'href',
      '/workspace/665f1c2e8a1b2c3d4e5f6a02',
    );
    expect(screen.getByText('#general')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nguyễn Văn An' })).toBeInTheDocument();
    expect(screen.getByText('4 báo cáo · 2 tin bị gỡ')).toBeInTheDocument();
    expect(screen.getByText('Người kiểm duyệt phạm vi và nền tảng')).toBeInTheDocument();

    // Nền tảng thấy danh tính người báo cáo + mô tả.
    expect(screen.getByText('Trần Thị Bình')).toBeInTheDocument();
    expect(screen.getByText('Quảng cáo liên tục')).toBeInTheDocument();

    // Lịch sử: dòng dẫn sang chi tiết của báo cáo đó.
    expect(screen.getByRole('link', { name: 'Người dùng' })).toHaveAttribute(
      'href',
      '/moderation/h-1',
    );
  });

  it('tin trong kênh public hiện ngay (tin bị báo cáo tô nổi bật), KHÔNG có cổng xem riêng tư', async () => {
    renderDetail();

    expect(await screen.findByText('Tin ngữ cảnh trước')).toBeInTheDocument();
    expect(screen.getByText('Nội dung tin bị báo cáo')).toBeInTheDocument();
    expect(screen.getByText('Tin bị báo cáo')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Xem nội dung \(được ghi nhật ký\)/ }),
    ).not.toBeInTheDocument();
  });

  it('đích không phải tin nhắn → không có khối nội dung để hiện', async () => {
    detail = makeDetail({
      group: makeGroup({ targetType: 'USER', scope: { type: null, isPrivate: false } }),
      publicContent: undefined,
    });
    renderDetail();

    expect(await screen.findByText('Không có nội dung tin nhắn')).toBeInTheDocument();
  });

  it('báo cáo không tồn tại (404) → "Không tải được báo cáo"', async () => {
    server.use(http.get('*/admin/reports/:id', () => errorJson(404, 'RES_001', 'Không tìm thấy')));
    renderDetail();

    expect(await screen.findByText('Không tải được báo cáo')).toBeInTheDocument();
  });

  it('lỗi TẠM THỜI (5xx) → có "Thử lại" (khác 404: báo cáo không có/không được xem, thử lại vô ích); thử lại thành công thì hiện báo cáo', async () => {
    server.use(http.get('*/admin/reports/:id', () => errorJson(500, 'SYS_500', 'Lỗi máy chủ')));
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByText('Không tải được báo cáo')).toBeInTheDocument();
    expect(screen.queryByText('Báo cáo không tồn tại hoặc bạn không có quyền xem.')).not.toBeInTheDocument();

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Ngữ cảnh')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được báo cáo')).not.toBeInTheDocument();
  });

  it('404 → KHÔNG có nút "Thử lại" (thử lại vô ích), có lời giải thích', async () => {
    server.use(http.get('*/admin/reports/:id', () => errorJson(404, 'RES_001', 'Không tìm thấy')));
    renderDetail();

    expect(await screen.findByText('Báo cáo không tồn tại hoặc bạn không có quyền xem.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('nhật ký quản trị đọc đúng đối tượng Report của báo cáo này', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('*/audit-logs', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return okJson([], { nextCursor: null, hasMore: false, limit: 20 });
      }),
    );
    signIn([...PERM_MODERATE, 'audit-log:view']);
    renderDetail();

    await waitFor(() => expect(queries.length).toBeGreaterThan(0));
    expect(queries[0].get('targetType')).toBe('Report');
    expect(queries[0].get('targetId')).toBe(REPORT_ID);
  });
});

describe('chi tiết — quay lại hàng đợi', () => {
  it('có state.from → về ĐÚNG hàng đợi với bộ lọc đã đặt', async () => {
    const { router } = renderDetail({
      pathname: `/moderation/${REPORT_ID}`,
      state: { from: '/moderation?status=RESOLVED&reason=SPAM' },
    });
    await screen.findByText('Ngữ cảnh');

    // `href` phải trùng đích của cú bấm thường — chuột giữa / Ctrl+click mở thẻ mới cũng về đúng hàng đợi.
    expect(backLink()).toHaveAttribute('href', '/moderation?status=RESOLVED&reason=SPAM');
    await userEvent.click(backLink());

    expect(await screen.findByTestId('queue')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?status=RESOLVED&reason=SPAM');
  });

  it('mở bằng tab mới (không state) hoặc state lạ → về /moderation, không theo URL ngoài', async () => {
    const { router } = renderDetail({
      pathname: `/moderation/${REPORT_ID}`,
      state: { from: '//evil.example.com' },
    });
    await screen.findByText('Ngữ cảnh');

    // Giờ là LINK: `href` cũng không được mang URL ngoài (chuột giữa / Ctrl+click đi thẳng theo `href`).
    expect(backLink()).toHaveAttribute('href', '/moderation');
    await userEvent.click(backLink());

    await screen.findByTestId('queue');
    expect(router.state.location.pathname).toBe('/moderation');
  });
});

describe('chi tiết — hành động theo loại đích và quyền', () => {
  const cases: Array<{ name: string; group: Partial<AdminReportGroup>; expected: string[] }> = [
    {
      name: 'TIN NHẮN (kênh public)',
      group: {},
      expected: ['Gỡ nội dung', 'Cảnh cáo tác giả', 'Khoá tài khoản', 'Bỏ qua'],
    },
    {
      name: 'NGƯỜI DÙNG',
      group: { targetType: 'USER', scope: { type: null, isPrivate: false } },
      expected: ['Cảnh cáo tác giả', 'Khoá tài khoản', 'Bỏ qua'],
    },
    {
      name: 'KÊNH public',
      group: { targetType: 'CHANNEL', scope: { type: 'CHANNEL', isPrivate: false } },
      expected: ['Lưu trữ kênh', 'Bỏ qua'],
    },
    {
      name: 'KÊNH riêng tư (BE chặn `CH_012` nên không mời bấm)',
      group: { targetType: 'CHANNEL', scope: { type: 'CHANNEL', isPrivate: true } },
      expected: ['Bỏ qua'],
    },
    {
      name: 'NHÓM CHAT',
      group: { targetType: 'CONVERSATION', scope: { type: 'CONVERSATION', isPrivate: true } },
      expected: ['Giải tán nhóm chat', 'Bỏ qua'],
    },
  ];

  it.each(cases)('$name → đúng bộ nút', async ({ group, expected }) => {
    detail = makeDetail({ group: makeGroup(group) });
    renderDetail();
    await screen.findByText('Quyết định');

    expect(actionNames()).toEqual(expected);
  });

  it('manager KHÔNG có user:update → ẩn "Khoá tài khoản" (không chờ 403), các nút khác vẫn còn', async () => {
    signIn(PERM_MODERATE);
    renderDetail();
    await screen.findByText('Quyết định');

    expect(actionNames()).toEqual(['Gỡ nội dung', 'Cảnh cáo tác giả', 'Bỏ qua']);
  });

  it('chỉ có moderation:view → không nút nào, kèm giải thích', async () => {
    signIn(PERM_VIEW);
    renderDetail();

    expect(
      await screen.findByText('Tài khoản của bạn chỉ có quyền xem báo cáo, không có quyền xử lý.'),
    ).toBeInTheDocument();
    expect(actionNames()).toEqual([]);
  });

  it('nhóm đã xử lý → chỉ đọc: không nút hành động, có kết quả và lối về hàng đợi', async () => {
    detail = withGroup(detail, { status: 'RESOLVED', resolution: 'AUTHOR_WARNED' });
    renderDetail();

    expect(await screen.findByText('Báo cáo đã được xử lý')).toBeInTheDocument();
    expect(screen.getByText(/Kết quả: Đã cảnh cáo tác giả/)).toBeInTheDocument();
    expect(actionNames()).toEqual([]);
    expect(screen.getByRole('link', { name: 'Quay lại hàng đợi' })).toHaveAttribute(
      'href',
      '/moderation',
    );
  });
});

describe('chi tiết — lý do bắt buộc và xử lý lỗi', () => {
  async function openAction(name: string) {
    await screen.findByText('Quyết định');
    await userEvent.click(screen.getByRole('button', { name }));
    return screen.findByRole('dialog');
  }

  it('lý do dưới 10 ký tự → báo lỗi, KHÔNG gọi PATCH', async () => {
    renderDetail();
    const dialog = await openAction('Gỡ nội dung');

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'ngan qua');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gỡ nội dung' }));

    expect(await within(dialog).findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(patchCalls).toEqual([]);
  });

  it('modal nêu tác động của hành động và áp dụng cho cả nhóm', async () => {
    renderDetail();
    const dialog = await openAction('Khoá tài khoản');

    expect(within(dialog).getByText(/mất quyền truy cập trong vòng 1 phút/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Mọi báo cáo đang mở cùng đích này sẽ được đóng/),
    ).toBeInTheDocument();
  });

  it('lý do hợp lệ → PATCH đúng đường dẫn + body, toast, trang chuyển sang chỉ đọc', async () => {
    renderDetail();
    const dialog = await openAction('Gỡ nội dung');

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), '  Nội dung spam quảng cáo  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gỡ nội dung' }));

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0].path).toMatch(new RegExp(`/admin/reports/${REPORT_ID}$`));
    expect(patchCalls[0].body).toEqual({
      action: 'REMOVE_CONTENT',
      reason: 'Nội dung spam quảng cáo',
    });
    expect(await screen.findByText('Báo cáo đã được xử lý')).toBeInTheDocument();
    expect(toastTitles()).toContain('Đã xử lý báo cáo và ghi nhật ký');
    expect(actionNames()).toEqual([]);
  });

  it('"Khoá tài khoản" gửi action LOCK_AUTHOR', async () => {
    renderDetail();
    const dialog = await openAction('Khoá tài khoản');

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Vi phạm nhiều lần liên tiếp');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Khoá tài khoản' }));

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0].body.action).toBe('LOCK_AUTHOR');
  });

  it('409 MOD_001 (người khác đã xử lý) → toast thông điệp BE, modal đóng, trang tải lại thành chỉ đọc', async () => {
    patchFailure = { status: 409, code: 'MOD_001', message: 'Báo cáo này đã được xử lý' };
    renderDetail();
    const dialog = await openAction('Bỏ qua');

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Không vi phạm quy định nào');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bỏ qua báo cáo' }));

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastTitles()).toContain('Báo cáo này đã được xử lý');
    expect(await screen.findByText('Báo cáo đã được xử lý')).toBeInTheDocument();
    expect(actionNames()).toEqual([]);
  });
});
