/**
 * Xem nội dung riêng tư (D-06) trên `ReportDetailPage` (p1-08 admin.md §2.2, §4; README MOD-05…07):
 *  - thiếu `moderation:approve` → KHÔNG có nút xem nội dung (MOD-05 phía giao diện);
 *  - có quyền → phải XÁC NHẬN trước; hộp thoại nêu rõ "ghi nhật ký + thông báo người trong cuộc";
 *  - mỗi lần gọi `GET .../content` là một dòng audit + thông báo ⇒ chỉ đúng MỘT lần sau xác nhận,
 *    không gọi lại ngầm (đổi cửa sổ, đổi báo cáo);
 *  - hiển thị `accessExpiresAt`; `MOD_004`/`MOD_005` hiện ngay trong khối, không toast trùng;
 *  - gỡ tin nhanh cập nhật tại chỗ mà KHÔNG tải lại nội dung.
 */
import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRoomSubscriptions } from '@/core/socket';
import ReportDetailPage from '@/features/moderation/pages/ReportDetailPage';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { emitFromServer, fakeSocket } from './fake-socket';
import {
  errorJson,
  makePrivateContent,
  makePrivateDetail,
  okJson,
  PERM_MODERATE,
  PERM_VIEW,
  renderRoutes,
  REPORT_ID,
  signIn,
} from './moderation-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket: shared } = await import('./fake-socket');
  return { io: vi.fn(() => shared) };
});

const VIEW_BUTTON = 'Xem nội dung (được ghi nhật ký)';

let contentCalls = 0;
let contentResponse: () => Response | Promise<Response>;
let removeCalls: Array<{ path: string; body: Record<string, unknown> }> = [];

const server = setupServer(
  http.get('*/admin/reports/:id/content', () => {
    contentCalls += 1;
    return contentResponse();
  }),
  http.get('*/admin/reports/:id', () => okJson(makePrivateDetail())),
  http.get('*/audit-logs', () => okJson([], { nextCursor: null, hasMore: false, limit: 20 })),
  http.post('*/admin/messages/:id/remove', async ({ request, params }) => {
    removeCalls.push({
      path: new URL(request.url).pathname,
      body: (await request.json()) as Record<string, unknown>,
    });
    return okJson({ messageId: params.id, deletedAt: '2026-09-19T04:00:00.000Z' });
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
  contentCalls = 0;
  removeCalls = [];
  contentResponse = () => okJson(makePrivateContent());
  fakeSocket.emit.mockClear();
  resetRoomSubscriptions();
  useToastStore.setState({ toasts: [] });
  signIn(PERM_MODERATE);
});

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

function renderDetail(id = REPORT_ID) {
  return renderRoutes(
    [{ path: '/moderation/:id', element: <ReportDetailPage /> }],
    [`/moderation/${id}`],
  );
}

/** Bấm "Xem nội dung" rồi xác nhận trong hộp thoại. */
async function viewContent() {
  await userEvent.click(await screen.findByRole('button', { name: VIEW_BUTTON }));
  const dialog = await screen.findByRole('dialog', { name: 'Xem nội dung riêng tư?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận và xem' }));
}

describe('cổng xem nội dung riêng tư — quyền', () => {
  it('thiếu moderation:approve → chỉ có giải thích, KHÔNG có nút và KHÔNG gọi /content (MOD-05 UI)', async () => {
    signIn([...PERM_VIEW, 'moderation:update']);
    renderDetail();

    expect(await screen.findByText('Nội dung thuộc phạm vi riêng tư')).toBeInTheDocument();
    expect(screen.getByText(/Bạn không có quyền xem nội dung riêng tư/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: VIEW_BUTTON })).not.toBeInTheDocument();
    expect(contentCalls).toBe(0);
  });

  it('có quyền nhưng CHƯA xác nhận → có nút, không hiện nội dung, không gọi API', async () => {
    renderDetail();

    expect(await screen.findByRole('button', { name: VIEW_BUTTON })).toBeInTheDocument();
    expect(screen.queryByText('Tin riêng tư bị báo cáo')).not.toBeInTheDocument();
    expect(contentCalls).toBe(0);
  });
});

describe('cổng xem nội dung riêng tư — xác nhận', () => {
  it('hộp thoại nêu rõ hệ quả (ghi nhật ký + thông báo người trong cuộc); Huỷ → vẫn KHÔNG gọi API', async () => {
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: VIEW_BUTTON }));

    const dialog = await screen.findByRole('dialog', { name: 'Xem nội dung riêng tư?' });
    expect(within(dialog).getByText(/được ghi vào nhật ký quản trị/)).toBeInTheDocument();
    expect(within(dialog).getByText(/sẽ được thông báo/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy bỏ' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(contentCalls).toBe(0);
    expect(screen.getByRole('button', { name: VIEW_BUTTON })).toBeInTheDocument();
  });

  it('xác nhận → gọi ĐÚNG MỘT lần, hiện tin ±3 (tin bị báo cáo nổi bật, tin đã gỡ có nhãn) và hạn quyền xem', async () => {
    contentResponse = () =>
      okJson(makePrivateContent({ accessExpiresAt: '2026-09-20T03:00:00.000Z' }));
    renderDetail();
    await viewContent();

    expect(await screen.findByText('Tin riêng tư bị báo cáo')).toBeInTheDocument();
    expect(screen.getByText('Tin riêng tư trước')).toBeInTheDocument();
    expect(screen.getByText('Tin bị báo cáo')).toBeInTheDocument();
    expect(screen.getByText('Đã bị gỡ')).toBeInTheDocument();
    expect(screen.getByText(/nội dung gốc không còn được lưu/)).toBeInTheDocument();
    // Giờ hiển thị theo múi giờ máy — chỉ khẳng định dạng, không cứng giờ.
    expect(
      screen.getByText(/Quyền xem hết hạn lúc \d{2}:\d{2} \d{2}\/09\/2026/),
    ).toBeInTheDocument();
    expect(contentCalls).toBe(1);
  });

  it('báo cáo còn mở (accessExpiresAt = null) → nói rõ quyền xem còn hiệu lực', async () => {
    renderDetail();
    await viewContent();

    expect(
      await screen.findByText(/Quyền xem còn hiệu lực trong khi báo cáo đang mở/),
    ).toBeInTheDocument();
  });

  it('không gọi lại ngầm: đổi tab trình duyệt (focus/visibility) sau khi đã xem vẫn chỉ 1 lần', async () => {
    renderDetail();
    await viewContent();
    await screen.findByText('Tin riêng tư bị báo cáo');

    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 200));

    expect(contentCalls).toBe(1);
  });

  it('realtime (moderation:report-updated) làm mới chi tiết nhưng KHÔNG tải lại nội dung riêng tư', async () => {
    renderDetail();
    await viewContent();
    await screen.findByText('Tin riêng tư bị báo cáo');

    act(() =>
      emitFromServer('moderation:report-updated', {
        v: 1,
        groupKey: 'MESSAGE:m-1',
        status: 'RESOLVED',
        resolution: 'CONTENT_REMOVED',
      }),
    );
    await new Promise((r) => setTimeout(r, 200));

    expect(screen.getByText('Tin riêng tư bị báo cáo')).toBeInTheDocument();
    expect(contentCalls).toBe(1);
  });

  it('sang báo cáo KHÁC (bấm dòng lịch sử) → mất xác nhận cũ: phải xác nhận lại, chưa gọi API', async () => {
    renderDetail();
    await viewContent();
    await screen.findByText('Tin riêng tư bị báo cáo');

    await userEvent.click(screen.getByRole('link', { name: 'Người dùng' }));

    expect(await screen.findByRole('button', { name: VIEW_BUTTON })).toBeInTheDocument();
    expect(screen.queryByText('Tin riêng tư bị báo cáo')).not.toBeInTheDocument();
    expect(contentCalls).toBe(1);
  });
});

describe('cổng xem nội dung riêng tư — lỗi D-06', () => {
  it('403 MOD_005 → "Quyền xem đã hết hạn" ngay trong khối, KHÔNG toast trùng, không nút thử lại', async () => {
    contentResponse = () => errorJson(403, 'MOD_005', 'Quyền xem nội dung đã hết hạn');
    renderDetail();
    await viewContent();

    expect(await screen.findByText('Quyền xem đã hết hạn')).toBeInTheDocument();
    expect(screen.queryByText('Tin riêng tư bị báo cáo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xem lại' })).not.toBeInTheDocument();
    expect(toastTitles()).toEqual([]);
    expect(contentCalls).toBe(1);
  });

  it('403 MOD_004 → "Không có quyền xem nội dung này"', async () => {
    contentResponse = () => errorJson(403, 'MOD_004', 'Không có quyền xem nội dung này');
    renderDetail();
    await viewContent();

    expect(await screen.findByText('Không có quyền xem nội dung này')).toBeInTheDocument();
    expect(toastTitles()).toEqual([]);
  });

  it('404 → "Không tìm thấy nội dung"', async () => {
    contentResponse = () => errorJson(404, 'RES_001', 'Không tìm thấy');
    renderDetail();
    await viewContent();

    expect(await screen.findByText('Không tìm thấy nội dung')).toBeInTheDocument();
  });

  it('lỗi mạng/máy chủ → cho "Xem lại" nhưng PHẢI xác nhận lại (lần trước có thể đã ghi nhật ký)', async () => {
    contentResponse = () => errorJson(500, 'SYS_001', 'Lỗi máy chủ');
    renderDetail();
    await viewContent();

    await userEvent.click(await screen.findByRole('button', { name: 'Xem lại' }));

    expect(await screen.findByRole('button', { name: VIEW_BUTTON })).toBeInTheDocument();
    expect(contentCalls).toBe(1);
  });
});

describe('gỡ tin nhanh trong nội dung riêng tư', () => {
  const REMOVE_CONTEXT = 'Gỡ tin nhắn của Nguyễn Văn An';

  it('có moderation:update → gỡ được tin ngữ cảnh: POST đúng endpoint, đánh dấu tại chỗ, KHÔNG tải lại nội dung', async () => {
    renderDetail();
    await viewContent();
    await screen.findByText('Tin riêng tư trước');

    // Ba tin: hai tin còn nguyên có nút "Gỡ tin" (tin đã gỡ thì không).
    const buttons = screen.getAllByRole('button', { name: REMOVE_CONTEXT });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[0]);

    const dialog = await screen.findByRole('dialog', { name: /Gỡ tin nhắn/ });
    expect(within(dialog).getByText(/Tin hiển thị là đã bị gỡ với mọi người/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Chứa thông tin cá nhân');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gỡ tin' }));

    await waitFor(() => expect(removeCalls).toHaveLength(1));
    expect(removeCalls[0].path).toMatch(/\/admin\/messages\/p-0\/remove$/);
    expect(removeCalls[0].body).toEqual({ reason: 'Chứa thông tin cá nhân' });
    await waitFor(() => expect(screen.getAllByText('Đã bị gỡ')).toHaveLength(2));
    expect(screen.queryByText('Tin riêng tư trước')).not.toBeInTheDocument();
    expect(toastTitles()).toContain('Đã gỡ tin nhắn và ghi nhật ký');
    // Cập nhật tại chỗ — không có lần xem thứ hai (mỗi lần xem = 1 audit + 1 thông báo).
    expect(contentCalls).toBe(1);
  });

  it('chỉ moderation:approve (không update) → xem được nội dung nhưng KHÔNG có nút "Gỡ tin"', async () => {
    signIn(['moderation:view', 'moderation:approve']);
    renderDetail();
    await viewContent();
    await screen.findByText('Tin riêng tư bị báo cáo');

    expect(screen.queryByRole('button', { name: REMOVE_CONTEXT })).not.toBeInTheDocument();
  });
});
