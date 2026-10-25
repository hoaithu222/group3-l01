/**
 * Tab Lời mời (p6-08 admin.md §2.6, §4): bảng + lọc URL + "Tải thêm", ngăn kéo chi tiết (email ứng viên CHỈ khi đã chia sẻ), thread (ẩn ô soạn khi chưa INTERESTED / đã khoá),
 * thu hồi, và realtime (`offer:updated` / `offer:message-created`).
 */
import { act, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RecruiterPortalPage from '@/features/recruiter-portal/pages/RecruiterPortalPage';
import type { OfferDetail, OfferItem, OfferMessage } from '@/features/recruiter-portal/types/offer.types';
import type { MyCompany } from '@/features/recruiter-portal/types/portal.types';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { emitFromServer } from '../moderation/fake-socket';
import { COMPANY_ID, cursorMeta, errorBody, makeMe, makeOfferDetail, makeOfferItem, OFFER_ID, okBody, renderAt, signInHr } from './portal-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let me: MyCompany;
let listCalls: URL[] = [];
let pages: Array<{ data: OfferItem[]; next: string | null }> = [];
let detail: OfferDetail;
let detailMissing = false;
let messagesNewestFirst: OfferMessage[] = [];
let messageHits = 0;
let posts: Array<{ kind: 'withdraw' | 'message'; body?: Record<string, unknown> }> = [];

const server = setupServer(
  http.get('*/me/company', () => okBody(me)),
  http.get('*/companies/:id/members', () => okBody([{ userId: '665f1c2e8a1b2c3d4e5f6d01', name: 'HR Acme', email: 'hr@acme.vn', role: 'OWNER', joinedAt: '2026-09-20T02:00:00.000Z' }])),
  http.get('*/companies/:id/usage', () => okBody({ period: '2026-09', used: 1, quota: 5, remaining: 4, tier: 'FREE' })),
  http.post('*/companies/:id/offers/:offerId/withdraw', () => {
    posts.push({ kind: 'withdraw' });
    return okBody({ ...detail, status: 'WITHDRAWN' });
  }),
  http.get('*/companies/:id/offers/:offerId', () =>
    detailMissing ? errorBody(404, 'RES_001', 'Không tìm thấy lời mời') : okBody(detail),
  ),
  http.get('*/companies/:id/offers', ({ request }) => {
    const url = new URL(request.url);
    listCalls.push(url);
    const page = pages[url.searchParams.has('cursor') ? 1 : 0] ?? { data: [], next: null };
    return okBody(page.data, cursorMeta(page.next));
  }),
  http.get('*/offers/:offerId/messages', () => {
    messageHits += 1;
    return okBody(messagesNewestFirst, cursorMeta());
  }),
  http.post('*/offers/:offerId/messages', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    posts.push({ kind: 'message', body });
    return HttpResponse.json({ success: true, data: { id: 'm-new', side: 'COMPANY', content: body.content, createdAt: '2026-09-21T05:00:00.000Z' } }, { status: 201 });
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
  me = makeMe('APPROVED');
  listCalls = [];
  pages = [{ data: [makeOfferItem()], next: null }];
  detail = makeOfferDetail();
  detailMissing = false;
  messagesNewestFirst = [];
  messageHits = 0;
  posts = [];
  useToastStore.setState({ toasts: [] });
  signInHr();
});

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const OPEN_DETAIL = `/recruiter/portal?tab=offers&offerId=${OFFER_ID}`;

describe('bảng lời mời', () => {
  it('hiện ứng viên, tiêu đề (liên kết), người gửi, trạng thái BẰNG CHỮ, lý do từ chối dạng mã → chữ, số tin mới', async () => {
    pages = [
      {
        data: [
          makeOfferItem({ status: 'DECLINED', declineReason: 'NOT_A_FIT', respondedAt: '2026-09-21T02:00:00.000Z' }),
          makeOfferItem({ id: '665f1c2e8a1b2c3d4e5f6d10', title: 'Freelance thiết kế', status: 'INTERESTED', unreadMessages: 3, student: { userId: 's2', displayName: 'Tài khoản đã xoá', avatarUrl: null } }),
        ],
        next: null,
      },
    ];
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=offers');

    expect(await screen.findByRole('link', { name: 'Thực tập Frontend' })).toBeInTheDocument();
    expect(screen.getByText('Từ chối')).toBeInTheDocument();
    expect(screen.getByText('Vị trí chưa phù hợp')).toBeInTheDocument();
    expect(screen.getByText('Quan tâm')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản đã xoá')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    // Danh sách KHÔNG có email ứng viên.
    expect(document.body.textContent).not.toMatch(/sv-[a-z-]+@/);
  });

  it('?status=INTERESTED&recruiterId → BE nhận đúng tham số; khoảng ngày lọc phía client trên phần đã tải', async () => {
    pages = [
      {
        data: [
          makeOfferItem({ id: 'o-in', title: 'Trong khoảng', sentAt: '2026-09-10T03:00:00.000Z' }),
          makeOfferItem({ id: 'o-out', title: 'Ngoài khoảng', sentAt: '2026-08-01T03:00:00.000Z' }),
        ],
        next: null,
      },
    ];
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=offers&status=INTERESTED&recruiterId=665f1c2e8a1b2c3d4e5f6d01&from=2026-09-01&to=2026-09-30');

    expect(await screen.findByRole('link', { name: 'Trong khoảng' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ngoài khoảng' })).not.toBeInTheDocument();
    const p = listCalls[0].searchParams;
    expect(p.get('status')).toBe('INTERESTED');
    expect(p.get('recruiterId')).toBe('665f1c2e8a1b2c3d4e5f6d01');
    // Khoảng ngày CHƯA có tham số ở BE — không gửi.
    expect(p.has('from')).toBe(false);
    expect(p.has('to')).toBe(false);
  });

  it('"Tải thêm" gửi cursor rồi nối kết quả', async () => {
    pages = [
      { data: [makeOfferItem()], next: 'cur-2' },
      { data: [makeOfferItem({ id: 'o2', title: 'Trang hai' })], next: null },
    ];
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=offers');
    await screen.findByRole('link', { name: 'Thực tập Frontend' });

    await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));

    expect(await screen.findByRole('link', { name: 'Trang hai' })).toBeInTheDocument();
    expect(listCalls[listCalls.length - 1].searchParams.get('cursor')).toBe('cur-2');
  });

  it('rỗng → gợi ý gửi lời mời đầu tiên; đang lọc → "không khớp bộ lọc"', async () => {
    pages = [{ data: [], next: null }];
    const first = renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=offers');
    expect(await screen.findByText(/Chưa gửi lời mời nào/)).toBeInTheDocument();
    first.unmount();

    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=offers&status=EXPIRED');
    expect(await screen.findByText('Không có lời mời nào khớp bộ lọc')).toBeInTheDocument();
  });
});

describe('chi tiết lời mời', () => {
  it('nội dung + JD an toàn; email ứng viên CHỈ hiện khi sinh viên đã chia sẻ (sharedEmail)', async () => {
    detail = makeOfferDetail({ status: 'INTERESTED', sharedEmail: 'sv-chia-se@gmail.com', jdUrl: 'https://cdn.acme.vn/jd.pdf?sig=abc' });
    renderAt(<RecruiterPortalPage />, OPEN_DETAIL);

    const drawer = await screen.findByRole('dialog', { name: 'Thực tập Frontend' });
    expect(await within(drawer).findByText('Email ứng viên chia sẻ')).toBeInTheDocument();
    expect(within(drawer).getByText('sv-chia-se@gmail.com')).toBeInTheDocument();
    expect(within(drawer).getByText(/Chúng tôi muốn mời bạn thực tập tại Acme/)).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'Mở tệp JD' })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('chưa chia sẻ → không có email ở bất cứ đâu; JD javascript: không thành liên kết', async () => {
    detail = makeOfferDetail({ status: 'INTERESTED', sharedEmail: null, jdUrl: 'javascript:alert(1)' });
    renderAt(<RecruiterPortalPage />, OPEN_DETAIL);

    const drawer = await screen.findByRole('dialog', { name: 'Thực tập Frontend' });
    await within(drawer).findByText('Nội dung lời mời');
    expect(within(drawer).queryByText('Email ứng viên chia sẻ')).not.toBeInTheDocument();
    expect(drawer.textContent).not.toMatch(/\S+@\S+\.\S+/);
    expect(within(drawer).queryByRole('link', { name: 'Mở tệp JD' })).not.toBeInTheDocument();
  });

  it('404 → "Không tìm thấy lời mời", KHÔNG "Thử lại"', async () => {
    detailMissing = true;
    renderAt(<RecruiterPortalPage />, OPEN_DETAIL);

    expect(await screen.findByText('Không tìm thấy lời mời')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});

describe('thread trao đổi', () => {
  it('SENT/READ (chưa Quan tâm) → giải thích, KHÔNG gọi API tin nhắn, KHÔNG có ô soạn', async () => {
    detail = makeOfferDetail({ status: 'READ', threadOpen: false });
    renderAt(<RecruiterPortalPage />, OPEN_DETAIL);

    expect(await screen.findByText('Bạn chỉ trao đổi được với ứng viên sau khi họ bấm Quan tâm.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tin nhắn')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi tin' })).not.toBeInTheDocument();
    expect(messageHits).toBe(0);
  });

  it('INTERESTED + mở → tin hiện theo thứ tự ĐỌC (cũ → mới), có ô soạn; gửi tin kèm clientMessageId 8–64 ký tự rồi xoá ô', async () => {
    detail = makeOfferDetail({ status: 'INTERESTED', threadOpen: true });
    messagesNewestFirst = [
      { id: 'm2', side: 'CANDIDATE', content: 'Em cảm ơn, em quan tâm ạ', createdAt: '2026-09-21T04:00:00.000Z' },
      { id: 'm1', side: 'COMPANY', content: 'Chào bạn, mình đặt lịch nhé', createdAt: '2026-09-21T03:00:00.000Z' },
    ];
    renderAt(<RecruiterPortalPage />, OPEN_DETAIL);

    const list = await screen.findByRole('list', { name: 'Tin nhắn trong lời mời' });
    const texts = within(list).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(texts[0]).toContain('Chào bạn, mình đặt lịch nhé');
    expect(texts[1]).toContain('Em cảm ơn, em quan tâm ạ');
    expect(texts[0]).toContain('Doanh nghiệp');
    expect(texts[1]).toContain('Ứng viên');

    await userEvent.type(screen.getByLabelText('Tin nhắn'), 'Thứ Hai 9h nhé');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi tin' }));

    await waitFor(() => expect(posts.filter((p) => p.kind === 'message')).toHaveLength(1));
    const body = posts.find((p) => p.kind === 'message')?.body as { content: string; clientMessageId: string };
    expect(body.content).toBe('Thứ Hai 9h nhé');
    expect(body.clientMessageId).toMatch(/^.{8,64}$/);
    await waitFor(() => expect(screen.getByLabelText('Tin nhắn')).toHaveValue(''));
  });

  it('INTERESTED nhưng đã KHOÁ (chặn/tạm ngưng) → chỉ đọc, KHÔNG có ô soạn', async () => {
    detail = makeOfferDetail({ status: 'INTERESTED', threadOpen: false, threadLocked: true });
    renderAt(<RecruiterPortalPage />, OPEN_DETAIL);

    expect(await screen.findByText(/Trao đổi đang chỉ đọc/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi tin' })).not.toBeInTheDocument();
    await waitFor(() => expect(messageHits).toBeGreaterThan(0));
  });

  it('tin mới qua socket offer:message-created → tải lại thread (payload không có nội dung)', async () => {
    detail = makeOfferDetail({ status: 'INTERESTED', threadOpen: true });
    renderAt(<RecruiterPortalPage />, OPEN_DETAIL);
    await waitFor(() => expect(messageHits).toBe(1));

    messagesNewestFirst = [{ id: 'm9', side: 'CANDIDATE', content: 'Tin mới từ ứng viên', createdAt: '2026-09-21T06:00:00.000Z' }];
    act(() => emitFromServer('offer:message-created', { v: 1, offerId: OFFER_ID, messageId: 'm9', side: 'CANDIDATE', createdAt: '2026-09-21T06:00:00.000Z' }));

    expect(await screen.findByText('Tin mới từ ứng viên')).toBeInTheDocument();
    expect(messageHits).toBeGreaterThanOrEqual(2);
  });
});

describe('thu hồi lời mời', () => {
  it('READ + có quyền → "Thu hồi lời mời" → xác nhận → POST /withdraw + toast; nói rõ không hoàn lượt', async () => {
    detail = makeOfferDetail({ status: 'READ' });
    renderAt(<RecruiterPortalPage />, OPEN_DETAIL);
    const drawer = await screen.findByRole('dialog', { name: 'Thực tập Frontend' });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Thu hồi lời mời' }));

    const confirm = await screen.findByRole('dialog', { name: 'Thu hồi lời mời?' });
    expect(within(confirm).getByText(/KHÔNG được hoàn lại/)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Thu hồi lời mời' }));

    await waitFor(() => expect(posts.filter((p) => p.kind === 'withdraw')).toHaveLength(1));
    await waitFor(() => expect(toastTitles()).toContain('Đã thu hồi lời mời'));
  });

  it('lời mời đã đóng (DECLINED) → không có nút thu hồi', async () => {
    detail = makeOfferDetail({ status: 'DECLINED', declineReason: 'TIMING' });
    renderAt(<RecruiterPortalPage />, OPEN_DETAIL);

    const drawer = await screen.findByRole('dialog', { name: 'Thực tập Frontend' });
    await within(drawer).findByText('Chưa đúng thời điểm');
    expect(within(drawer).queryByRole('button', { name: 'Thu hồi lời mời' })).not.toBeInTheDocument();
  });

  it('thiếu quyền company.offer → không có nút thu hồi', async () => {
    me = { ...makeMe('APPROVED'), permissions: ['company.view', 'company.talent'] };
    detail = makeOfferDetail({ status: 'SENT' });
    renderAt(<RecruiterPortalPage />, OPEN_DETAIL);

    const drawer = await screen.findByRole('dialog', { name: 'Thực tập Frontend' });
    await within(drawer).findByText('Nội dung lời mời');
    expect(within(drawer).queryByRole('button', { name: 'Thu hồi lời mời' })).not.toBeInTheDocument();
  });
});

describe('realtime', () => {
  it('offer:updated của doanh nghiệp này → làm mới danh sách; của doanh nghiệp khác bị bỏ qua', async () => {
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=offers');
    await screen.findByRole('link', { name: 'Thực tập Frontend' });
    const before = listCalls.length;

    act(() => emitFromServer('offer:updated', { v: 1, offerId: 'x', companyId: '665f1c2e8a1b2c3d4e5f9999', status: 'READ', threadLocked: false }));
    await act(() => new Promise((r) => setTimeout(r, 150)));
    expect(listCalls.length).toBe(before);

    pages = [{ data: [makeOfferItem({ status: 'READ' })], next: null }];
    act(() => emitFromServer('offer:updated', { v: 1, offerId: OFFER_ID, companyId: COMPANY_ID, status: 'READ', threadLocked: false }));

    await waitFor(() => expect(listCalls.length).toBeGreaterThan(before));
    expect(await screen.findByText('Đã xem')).toBeInTheDocument();
  });
});
