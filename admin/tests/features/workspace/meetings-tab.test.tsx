/**
 * Tab "Cuộc họp" của workspace (p2-04 admin.md §2.1, §4) — CHỈ đọc metadata: cột, nhãn trạng thái chữ, giờ theo trình duyệt + múi giờ cuộc họp,
 * lọc trạng thái/khoảng ngày và phân trang phía SERVER (đồng bộ URL), KHÔNG lộ agenda/địa điểm/link/mã họp/người tham dự dù BE lỡ trả kèm,
 * cờ tắt giữa chừng (404 CFG_005) không phải lỗi. Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import WorkspaceMeetingsTab from '@/features/workspace/components/tabs/WorkspaceMeetingsTab';

import { BROWSER_TZ, errorBody, FOUR_STATUSES, makeMeeting, okBody, OTHER_TZ, pageMeta, renderTabAt, urlParam } from './meetings-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const URL0 = '/workspace/ws-1?tab=meetings';
const renderTab = (url = URL0) => renderTabAt(<WorkspaceMeetingsTab workspaceId="ws-1" />, url);

/** Ghi lại tham số mọi lần gọi và trả `rows` (mặc định 4 trạng thái) với tổng `total`. */
function mockMeetings(rows = FOUR_STATUSES, total = rows.length) {
  const calls: { path: string; q: URLSearchParams }[] = [];
  server.use(
    http.get('*/admin/workspaces/:id/meetings', ({ request }) => {
      const u = new URL(request.url);
      calls.push({ path: u.pathname, q: u.searchParams });
      const page = Number(u.searchParams.get('page') ?? 1);
      return okBody(rows, pageMeta(total, page, Number(u.searchParams.get('limit') ?? 20)));
    }),
  );
  return calls;
}

describe('WorkspaceMeetingsTab — hiển thị', () => {
  it('gọi đúng endpoint của workspace (page=1, limit=20, không lọc); mọi trạng thái có nhãn CHỮ, nền tảng và số người', async () => {
    const calls = mockMeetings();
    renderTab();

    for (const title of ['Họp sắp tới', 'Họp đang diễn ra', 'Họp đã xong', 'Họp đã huỷ']) expect(await screen.findByText(title)).toBeInTheDocument();
    expect(calls[0]!.path).toMatch(/\/admin\/workspaces\/ws-1\/meetings$/);
    expect([calls[0]!.q.get('page'), calls[0]!.q.get('limit'), calls[0]!.q.get('status'), calls[0]!.q.get('from'), calls[0]!.q.get('to')]).toEqual(['1', '20', null, null, null]);

    const row = (title: string) => screen.getByText(title).closest('tr')!;
    expect(within(row('Họp sắp tới')).getByText('Sắp tới')).toBeInTheDocument();
    expect(within(row('Họp đang diễn ra')).getByText('Đang diễn ra')).toBeInTheDocument();
    expect(within(row('Họp đang diễn ra')).getByText('Zoom')).toBeInTheDocument();
    expect(within(row('Họp đã xong')).getByText('Đã kết thúc')).toBeInTheDocument();
    expect(within(row('Họp đã xong')).getByText('Chủ trì kết thúc')).toBeInTheDocument(); // lý do kết thúc chỉ ở cuộc họp đã kết thúc
    expect(within(row('Họp đã xong')).getByText('Microsoft Teams')).toBeInTheDocument();
    expect(within(row('Họp đã huỷ')).getByText('Đã huỷ')).toBeInTheDocument();
    expect(within(row('Họp đã huỷ')).getByText('Google Meet')).toBeInTheDocument();
    expect(within(row('Họp sắp tới')).getByText('An Nguyễn')).toBeInTheDocument();
    expect(within(row('Họp sắp tới')).getByText('5')).toBeInTheDocument();
    expect(within(row('Họp sắp tới')).getByText('Nội bộ')).toBeInTheDocument();
  });

  it('KHÔNG LỘ nội dung: dù BE lỡ trả agenda/địa điểm/link/mã họp/người tham dự, DOM không hiện những thứ đó (chỉ cột metadata)', async () => {
    const hostile = {
      ...makeMeeting({ title: 'Họp kín' }),
      agenda: 'CHUONG-TRINH-BI-MAT',
      location: 'PHONG-KIN-TANG-99',
      externalUrl: 'https://zoom.us/j/999?pwd=MAT-KHAU',
      code: 'abc-defg-hij',
      attendees: [{ userId: 'u9', name: 'NGUOI-THAM-DU-BI-AN' }],
    } as unknown as ReturnType<typeof makeMeeting>;
    mockMeetings([hostile]);
    renderTab();

    await screen.findByText('Họp kín');
    const text = document.body.textContent ?? '';
    for (const secret of ['CHUONG-TRINH-BI-MAT', 'PHONG-KIN-TANG-99', 'MAT-KHAU', 'zoom.us', 'abc-defg-hij', 'NGUOI-THAM-DU-BI-AN']) expect(text).not.toContain(secret);
    expect(document.querySelector('a[href*="zoom"]')).toBeNull();
    // Không có cột agenda/địa điểm/link/ghi hình; ghi chú riêng tư luôn hiện.
    for (const header of ['Chương trình', 'Địa điểm', 'Đường dẫn', 'Ghi hình', 'Người tham dự']) expect(screen.queryByText(header)).not.toBeInTheDocument();
    expect(screen.getByText(/không được hiển thị/)).toBeInTheDocument();
  });

  it('giờ theo trình duyệt; múi giờ cuộc họp KHÁC trình duyệt → thêm dòng "giờ <múi giờ> …", TRÙNG → không có dòng phụ; chủ trì mất tài khoản có nhãn riêng', async () => {
    mockMeetings([
      makeMeeting({ id: 'same', title: 'Cùng múi giờ', timezone: BROWSER_TZ }),
      makeMeeting({ id: 'other', title: 'Khác múi giờ', timezone: OTHER_TZ }),
      makeMeeting({ id: 'bad', title: 'Múi giờ hỏng', timezone: 'Khong/Hop-Le' }),
      makeMeeting({ id: 'gone', title: 'Mất chủ trì', host: { id: 'u-x', name: null } }),
    ]);
    renderTab();
    await screen.findByText('Cùng múi giờ');
    const row = (t: string) => screen.getByText(t).closest('tr')!;
    const hm = (iso: string) => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: OTHER_TZ }).format(new Date(iso));

    expect(within(row('Cùng múi giờ')).queryByText(/^giờ /)).not.toBeInTheDocument();
    expect(within(row('Khác múi giờ')).getByText(`giờ ${OTHER_TZ} ${hm('2026-10-05T02:00:00.000Z')} – ${hm('2026-10-05T03:00:00.000Z')}`)).toBeInTheDocument();
    expect(within(row('Múi giờ hỏng')).queryByText(/^giờ /)).not.toBeInTheDocument(); // chuỗi múi giờ lạ không làm vỡ bảng
    expect(within(row('Mất chủ trì')).getByText('Không còn tài khoản')).toBeInTheDocument();
    expect(within(row('Cùng múi giờ')).getByText(/05\/10\/2026|0\d\/10\/2026|1\d\/10\/2026/)).toBeInTheDocument();
  });

  it('workspace chưa có cuộc họp → "Workspace chưa có cuộc họp"', async () => {
    mockMeetings([], 0);
    renderTab();
    expect(await screen.findByText('Workspace chưa có cuộc họp')).toBeInTheDocument();
  });
});

describe('WorkspaceMeetingsTab — lọc và phân trang phía server', () => {
  it('lọc trạng thái → gửi `status`, ghi URL ?meetingStatus=, về trang 1; "Xoá bộ lọc" bỏ hết', async () => {
    const calls = mockMeetings();
    const { router } = renderTab(`${URL0}&page=3`);
    await screen.findByText('Họp sắp tới');
    expect(calls[0]!.q.get('page')).toBe('3');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Đã huỷ' }));

    await waitFor(() => expect(calls.at(-1)!.q.get('status')).toBe('CANCELLED'));
    expect(calls.at(-1)!.q.get('page')).toBe('1');
    expect(urlParam(router, 'meetingStatus')).toBe('CANCELLED');
    expect(urlParam(router, 'tab')).toBe('meetings'); // giữ tab

    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    await waitFor(() => expect(calls.at(-1)!.q.get('status')).toBeNull());
    expect(urlParam(router, 'meetingStatus')).toBeNull();
  });

  it('URL có khoảng ngày → from = đầu ngày, to = cuối ngày (giờ máy); đóng cả hai đầu; giá trị hỏng bị bỏ', async () => {
    const calls = mockMeetings();
    renderTab(`${URL0}&meetingFrom=2026-09-01&meetingTo=2026-09-30&meetingStatus=ENDED`);
    await screen.findByText('Họp sắp tới');
    const q = calls.at(-1)!.q;
    expect(q.get('from')).toBe(new Date(2026, 8, 1, 0, 0, 0, 0).toISOString());
    expect(q.get('to')).toBe(new Date(2026, 8, 30, 23, 59, 59, 999).toISOString());
    expect(q.get('status')).toBe('ENDED');
  });

  it('?meetingStatus= lạ / ngày sai định dạng → bỏ qua (không gửi lên server)', async () => {
    const calls = mockMeetings();
    renderTab(`${URL0}&meetingStatus=KHONG-CO&meetingFrom=khong-phai-ngay`);
    await screen.findByText('Họp sắp tới');
    expect([calls[0]!.q.get('status'), calls[0]!.q.get('from')]).toEqual([null, null]);
  });

  it('đang lọc mà không có kết quả → "Không có cuộc họp nào khớp bộ lọc"', async () => {
    mockMeetings([], 0);
    renderTab(`${URL0}&meetingStatus=LIVE`);
    expect(await screen.findByText('Không có cuộc họp nào khớp bộ lọc')).toBeInTheDocument();
  });

  it('phân trang server: 45 cuộc họp → bấm trang 2 gọi page=2 và ghi URL ?page=2', async () => {
    const calls = mockMeetings(FOUR_STATUSES, 45);
    const { router } = renderTab();
    await screen.findByText('Họp sắp tới');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Trang 2' }));

    await waitFor(() => expect(calls.at(-1)!.q.get('page')).toBe('2'));
    expect(urlParam(router, 'page')).toBe('2');
  });
});

describe('WorkspaceMeetingsTab — lỗi', () => {
  it('cờ meeting tắt giữa chừng (404 CFG_005) → "Lịch họp đang tắt", KHÔNG phải lỗi', async () => {
    server.use(http.get('*/admin/workspaces/:id/meetings', () => errorBody(404, 'CFG_005', 'Tính năng chưa được bật')));
    renderTab();
    expect(await screen.findByText('Lịch họp đang tắt')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh sách cuộc họp')).not.toBeInTheDocument();
  });

  it('lỗi máy chủ → báo lỗi có "Thử lại"; bấm là tải lại thành công', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/workspaces/:id/meetings', () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_500', 'Lỗi hệ thống') : okBody(FOUR_STATUSES, pageMeta(4));
      }),
    );
    renderTab();
    expect(await screen.findByText('Không tải được danh sách cuộc họp')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Họp sắp tới')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh sách cuộc họp')).not.toBeInTheDocument();
  });

  it('thiếu quyền (403) → báo không có quyền, KHÔNG có "Thử lại" (thử lại vẫn 403)', async () => {
    server.use(http.get('*/admin/workspaces/:id/meetings', () => errorBody(403, 'AUTH_005', 'Không có quyền')));
    renderTab();

    expect(await screen.findByText('Không tải được danh sách cuộc họp')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản của bạn không có quyền xem mục này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});

describe('WorkspaceMeetingsTab — liên kết sang trang vận hành', () => {
  const signIn = (permissions: string[]) => {
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAuth({
      user: { id: 'me', email: 'a@x.vn', name: 'Quản lý', roles: ['manager'], permissions },
      token: 'test-token',
    });
  };
  const LINK = 'Xem tất cả cuộc họp của workspace';

  it('có meeting:view → liên kết tới /meeting?tab=meetings&workspaceId=<id> (đã lọc theo workspace)', async () => {
    mockMeetings();
    signIn(['workspace:view', 'meeting:view']);
    renderTab();

    const link = await screen.findByRole('link', { name: LINK });
    const url = new URL(link.getAttribute('href')!, 'http://x');
    expect(url.pathname).toBe('/meeting');
    expect(Object.fromEntries(url.searchParams)).toEqual({ tab: 'meetings', workspaceId: 'ws-1' });
  });

  it('thiếu meeting:view → KHÔNG có liên kết (trang vận hành sẽ chặn vào)', async () => {
    mockMeetings();
    signIn(['workspace:view']);
    renderTab();

    await screen.findByText('Họp sắp tới');
    expect(screen.queryByRole('link', { name: LINK })).not.toBeInTheDocument();
  });
});
