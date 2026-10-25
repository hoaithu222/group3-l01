/**
 * Tab `companies` của `/recruiter` (p6-08 admin.md §2.1, §4): bảng doanh nghiệp lọc "Chờ duyệt" TỪ URL, bộ lọc mặc định "Chờ duyệt khi có", `status=all`, tìm theo tên (lọc SERVER),
 * lỗi tải (Callout + "Thử lại" ≠ 403 "không có quyền"), bấm dòng mở ngăn kéo qua `?companyId=`.
 *
 * Mock ở tầng HTTP (MSW) — lỗi đi qua axios interceptor thật.
 */
import { configure, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RecruiterOpsPage from '@/features/recruiter/pages/RecruiterOpsPage';
import type { AdminCompanyItem } from '@/features/recruiter/types/recruiter.types';

import { errorBody, makeDetail, makeItem, okBody, pageMeta, PERM_APPROVE, renderAt, signInOps } from './recruiter-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let listCalls: URL[] = [];
let pendingTotal = 1;
let items: AdminCompanyItem[] = [];
let listFailure: { status: number; code: string } | null = null;

const server = setupServer(
  http.get('*/admin/companies/:id', () => okBody(makeDetail())),
  http.get('*/audit-logs', () => okBody([], { nextCursor: null, hasMore: false, limit: 20 })),
  http.get('*/admin/companies', ({ request }) => {
    const url = new URL(request.url);
    listCalls.push(url);
    if (listFailure) return errorBody(listFailure.status, listFailure.code, 'lỗi');
    // Câu hỏi "có bao nhiêu doanh nghiệp chờ duyệt" (`limit=1`, `status=PENDING`) — quyết định bộ lọc mặc định.
    if (url.searchParams.get('limit') === '1' && url.searchParams.get('status') === 'PENDING') {
      return okBody([makeItem()], pageMeta(pendingTotal, 1, 1));
    }
    return okBody(items, pageMeta(items.length));
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
  listCalls = [];
  pendingTotal = 1;
  listFailure = null;
  items = [makeItem(), makeItem({ id: '665f1c2e8a1b2c3d4e5f6b09', name: 'Công ty Beta', status: 'APPROVED', tier: 'PRO', quota: 50, offersThisMonth: 12 })];
  signInOps(PERM_APPROVE);
});

/** Các lượt gọi DANH SÁCH thật (bỏ câu hỏi đếm `limit=1`). */
const listRequests = () => listCalls.filter((u) => u.searchParams.get('limit') !== '1');

describe('bảng doanh nghiệp — lọc từ URL', () => {
  it('?status=PENDING → gửi status=PENDING, hiện tên, gói, hạn mức và trạng thái BẰNG CHỮ', async () => {
    renderAt(<RecruiterOpsPage />, '/recruiter?status=PENDING');

    expect(await screen.findByRole('link', { name: 'Công ty Acme' })).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getAllByText('Chờ duyệt').length).toBeGreaterThan(0);
    expect(listRequests().every((u) => u.searchParams.get('status') === 'PENDING')).toBe(true);
    // Đã chọn tường minh → KHÔNG cần hỏi trước số doanh nghiệp chờ duyệt.
    expect(listCalls.some((u) => u.searchParams.get('limit') === '1')).toBe(false);
  });

  it('URL chưa chọn trạng thái và ĐANG có doanh nghiệp chờ duyệt → mặc định lọc "Chờ duyệt"', async () => {
    renderAt(<RecruiterOpsPage />, '/recruiter');

    await screen.findByRole('link', { name: 'Công ty Acme' });
    expect(listRequests().length).toBeGreaterThan(0);
    expect(listRequests().every((u) => u.searchParams.get('status') === 'PENDING')).toBe(true);
  });

  it('URL chưa chọn trạng thái và KHÔNG có doanh nghiệp chờ duyệt → hiện tất cả (không gửi status)', async () => {
    pendingTotal = 0;
    renderAt(<RecruiterOpsPage />, '/recruiter');

    await screen.findByRole('link', { name: 'Công ty Beta' });
    expect(listRequests().length).toBeGreaterThan(0);
    expect(listRequests().every((u) => !u.searchParams.has('status'))).toBe(true);
  });

  it('?status=all → tất cả, không bị kéo về "Chờ duyệt" dù đang có doanh nghiệp chờ duyệt', async () => {
    renderAt(<RecruiterOpsPage />, '/recruiter?status=all');

    await screen.findByRole('link', { name: 'Công ty Beta' });
    expect(listRequests().every((u) => !u.searchParams.has('status'))).toBe(true);
    expect(listCalls.some((u) => u.searchParams.get('limit') === '1')).toBe(false);
  });

  it('giá trị status lạ trên URL bị bỏ — không gửi cho BE (BE trả 400 với enum lạ)', async () => {
    pendingTotal = 0;
    renderAt(<RecruiterOpsPage />, '/recruiter?status=HACKED&tier=GOLD');

    await screen.findByRole('link', { name: 'Công ty Acme' });
    for (const u of listRequests()) {
      expect(u.searchParams.get('status')).not.toBe('HACKED');
      expect(u.searchParams.has('tier')).toBe(false);
    }
  });

  it('gõ tên vào ô tìm → URL có q và BE nhận q (lọc SERVER, có debounce)', async () => {
    const { router } = renderAt(<RecruiterOpsPage />, '/recruiter?status=all');
    await screen.findByRole('link', { name: 'Công ty Beta' });

    await userEvent.type(screen.getByPlaceholderText('Tìm theo tên doanh nghiệp…'), 'acme');

    await waitFor(() => expect(router.state.location.search).toContain('q=acme'));
    await waitFor(() => expect(listRequests().some((u) => u.searchParams.get('q') === 'acme')).toBe(true));
  });
});

describe('trạng thái lỗi tải', () => {
  it('mất mạng/5xx → Callout "Thử lại", KHÔNG vẽ bảng "chưa có doanh nghiệp"', async () => {
    listFailure = { status: 500, code: 'SYS_001' };
    renderAt(<RecruiterOpsPage />, '/recruiter?status=all');

    expect(await screen.findByText('Không tải được danh sách doanh nghiệp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText('Chưa có doanh nghiệp nào đăng ký')).not.toBeInTheDocument();
  });

  it('403 (nhân sự doanh nghiệp mở nhầm URL vận hành) → nói rõ không có quyền, KHÔNG có "Thử lại"', async () => {
    listFailure = { status: 403, code: 'AUTH_006' };
    renderAt(<RecruiterOpsPage />, '/recruiter?status=all');

    expect(await screen.findByText('Không xem được danh sách doanh nghiệp')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('danh sách rỗng khi đang lọc → "Không có doanh nghiệp nào khớp bộ lọc"', async () => {
    items = [];
    renderAt(<RecruiterOpsPage />, '/recruiter?status=REJECTED');

    expect(await screen.findByText('Không có doanh nghiệp nào khớp bộ lọc')).toBeInTheDocument();
  });
});

describe('ngăn kéo chi tiết', () => {
  it('bấm dòng → URL có companyId và ngăn kéo mở trên nền danh sách', async () => {
    const { router } = renderAt(<RecruiterOpsPage />, '/recruiter?status=PENDING');
    await screen.findByRole('link', { name: 'Công ty Acme' });

    await userEvent.click(screen.getByText('3 / 5'));

    await waitFor(() => expect(router.state.location.search).toContain('companyId='));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(router.state.location.search).toContain('status=PENDING');
  });
});
