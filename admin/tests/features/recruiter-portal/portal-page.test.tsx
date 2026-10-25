/**
 * Trang `/recruiter/portal` (p6-08 admin.md §2.4, §4): trạng thái doanh nghiệp quyết định cả trang.
 * - PENDING/REJECTED/SUSPENDED → banner (`Callout`) và KHÔNG gọi API ứng viên (CR-08: BE trả 403 `RECR_002`) — assert bằng MSW: không request nào tới `/talent/search` hay `/skills`;
 * - REJECTED: lý do + "Sửa và gửi lại" (chỉ OWNER); SUSPENDED: lý do, tab Lời mời vẫn đọc được;
 * - chưa có doanh nghiệp (404 `RES_001`) ≠ tính năng chưa bật (404 `CFG_005`) ≠ lỗi tạm thời;
 * - realtime: `company:updated` làm mới trạng thái (duyệt xong là dùng được ngay, không cần F5);
 * - tiêu đề + dải tab nằm trên THANH HEADER (bọc `HeaderSlotsHarness`); dải tab chỉ có khi đã có `me`.
 */
import { act, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RecruiterPortalPage from '@/features/recruiter-portal/pages/RecruiterPortalPage';
import type { MyCompany } from '@/features/recruiter-portal/types/portal.types';
import { HeaderSlotsHarness } from '@tests/shared/header-slots-harness';

import { emitFromServer } from '../moderation/fake-socket';
import { COMPANY_ID, cursorMeta, errorBody, makeMe, makeTalent, okBody, renderAt, signInHr } from './portal-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let me: MyCompany;
let meFailure: { status: number; code: string } | null = null;
let hits: string[] = [];

const server = setupServer(
  http.get('*/me/company', () => {
    hits.push('me');
    return meFailure ? errorBody(meFailure.status, meFailure.code, 'lỗi') : okBody(me);
  }),
  http.get('*/companies/:id/talent/search', () => {
    hits.push('search');
    return okBody([makeTalent()], cursorMeta());
  }),
  http.get('*/skills', () => {
    hits.push('skills');
    return okBody([{ code: 'reactjs', name: 'React' }]);
  }),
  http.get('*/companies/:id/offers', () => {
    hits.push('offers');
    return okBody([], cursorMeta());
  }),
  http.get('*/companies/:id/members', () => okBody([])),
  http.get('*/companies/:id/usage', () => okBody({ period: '2026-09', used: 1, quota: 5, remaining: 4, tier: 'FREE' })),
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
  meFailure = null;
  hits = [];
  signInHr();
});

/** Chờ thêm một nhịp cho request muộn (nếu có) rồi mới khẳng định "KHÔNG có request". */
const settle = () => act(() => new Promise((r) => setTimeout(r, 150)));

/** Render kèm ĐÍCH PORTAL của thanh header — tiêu đề và chip tab nằm ở đó (`<PageHeader>`), không trong vùng nội dung. */
const renderWithHeader = (url: string) =>
  renderAt(
    <HeaderSlotsHarness>
      <RecruiterPortalPage />
    </HeaderSlotsHarness>,
    url,
  );

describe('doanh nghiệp chưa duyệt — KHÔNG gọi API ứng viên', () => {
  it('PENDING → banner "chờ duyệt / 1–2 ngày làm việc"; MSW không nhận request /talent/search và /skills', async () => {
    me = makeMe('PENDING');
    renderAt(<RecruiterPortalPage />, '/recruiter/portal');

    expect(await screen.findByText('Doanh nghiệp đang chờ duyệt')).toBeInTheDocument();
    expect(screen.getByText(/1–2 ngày làm việc/)).toBeInTheDocument();
    await settle();

    expect(hits).not.toContain('search');
    expect(hits).not.toContain('skills');
    expect(screen.queryByText('Bộ lọc ứng viên')).not.toBeInTheDocument();
  });

  it('REJECTED (OWNER) → lý do + "Sửa và gửi lại" chuyển sang tab Công ty; vẫn không gọi API ứng viên', async () => {
    me = makeMe('REJECTED', 'OWNER', 'Website không truy cập được');
    const { router } = renderAt(<RecruiterPortalPage />, '/recruiter/portal');

    expect(await screen.findByText(/Website không truy cập được/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sửa và gửi lại' }));

    await waitFor(() => expect(router.state.location.search).toContain('tab=company'));
    expect(await screen.findByText('Hồ sơ doanh nghiệp')).toBeInTheDocument();
    await settle();
    expect(hits).not.toContain('search');
  });

  it('REJECTED nhưng KHÔNG phải OWNER → không có nút, nói rõ chỉ chủ sở hữu sửa được', async () => {
    me = makeMe('REJECTED', 'RECRUITER', 'Thiếu thông tin');
    renderAt(<RecruiterPortalPage />, '/recruiter/portal');

    expect(await screen.findByText(/Chỉ chủ sở hữu doanh nghiệp sửa và gửi lại được hồ sơ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa và gửi lại' })).not.toBeInTheDocument();
  });

  it('SUSPENDED → banner + lý do; tab Lời mời vẫn đọc được (lời mời mở chỉ đọc)', async () => {
    me = makeMe('SUSPENDED', 'OWNER', 'Nhiều báo cáo spam');
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=offers');

    expect(await screen.findByText('Doanh nghiệp đang tạm ngưng')).toBeInTheDocument();
    expect(screen.getByText(/Nhiều báo cáo spam/)).toBeInTheDocument();
    await waitFor(() => expect(hits).toContain('offers'));
    expect(hits).not.toContain('search');
  });

  it('APPROVED → không banner; tab Ứng viên gọi tìm kiếm và danh mục kỹ năng', async () => {
    renderAt(<RecruiterPortalPage />, '/recruiter/portal');

    expect(await screen.findByText('Lê Minh Châu')).toBeInTheDocument();
    expect(screen.queryByText('Doanh nghiệp đang chờ duyệt')).not.toBeInTheDocument();
    expect(hits).toContain('search');
    expect(hits).toContain('skills');
  });
});

describe('ba trạng thái của /me/company không gộp', () => {
  it('404 RES_001 (chưa thuộc doanh nghiệp) → mời đăng ký, link tới /recruiter/signup', async () => {
    meFailure = { status: 404, code: 'RES_001' };
    renderAt(<RecruiterPortalPage />, '/recruiter/portal');

    expect(await screen.findByText('Bạn chưa có doanh nghiệp')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng ký doanh nghiệp' })).toHaveAttribute('href', '/recruiter/signup');
    expect(hits).not.toContain('search');
  });

  it('404 CFG_005 (tính năng chưa bật) → trang "chưa bật", KHÔNG mời đăng ký', async () => {
    meFailure = { status: 404, code: 'CFG_005' };
    renderAt(<RecruiterPortalPage />, '/recruiter/portal');

    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
    expect(screen.queryByText('Bạn chưa có doanh nghiệp')).not.toBeInTheDocument();
  });

  it('5xx → Callout "Thử lại" (lỗi tạm thời, không kết luận "chưa có doanh nghiệp")', async () => {
    meFailure = { status: 500, code: 'SYS_001' };
    renderAt(<RecruiterPortalPage />, '/recruiter/portal');

    expect(await screen.findByText('Không tải được thông tin doanh nghiệp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText('Bạn chưa có doanh nghiệp')).not.toBeInTheDocument();
  });
});

describe('realtime & điều hướng tab', () => {
  it('company:updated (được duyệt) → làm mới trạng thái, tab Ứng viên hiện ngay không cần F5', async () => {
    me = makeMe('PENDING');
    renderAt(<RecruiterPortalPage />, '/recruiter/portal');
    expect(await screen.findByText('Doanh nghiệp đang chờ duyệt')).toBeInTheDocument();

    me = makeMe('APPROVED');
    act(() => emitFromServer('company:updated', { v: 1, companyId: COMPANY_ID, status: 'APPROVED', tier: 'FREE' }));

    expect(await screen.findByText('Lê Minh Châu')).toBeInTheDocument();
    expect(screen.queryByText('Doanh nghiệp đang chờ duyệt')).not.toBeInTheDocument();
  });

  it('company:updated của doanh nghiệp KHÁC bị bỏ qua', async () => {
    me = makeMe('PENDING');
    renderAt(<RecruiterPortalPage />, '/recruiter/portal');
    await screen.findByText('Doanh nghiệp đang chờ duyệt');
    const before = hits.filter((h) => h === 'me').length;

    act(() => emitFromServer('company:updated', { v: 1, companyId: '665f1c2e8a1b2c3d4e5f9999', status: 'APPROVED', tier: 'FREE' }));
    await settle();

    expect(hits.filter((h) => h === 'me').length).toBe(before);
  });

  it('đổi tab xoá khoá lọc của tab cũ khỏi URL (không kéo bộ lọc ứng viên sang tab Lời mời)', async () => {
    const { router } = renderWithHeader('/recruiter/portal?tab=talent&skills=reactjs&role=Frontend');
    await screen.findByText('Lê Minh Châu');

    await userEvent.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Lời mời' }));

    await waitFor(() => expect(router.state.location.search).toContain('tab=offers'));
    expect(router.state.location.search).not.toContain('skills');
    expect(router.state.location.search).not.toContain('role');
  });
});

describe('tiêu đề + dải tab trên thanh header (`<PageHeader nav>`)', () => {
  it('có `me` → h1 "Tuyển dụng" + tên doanh nghiệp, đủ ba chip tab, chip đang mở `aria-current`; href chip đã dọn khoá lọc của tab cũ', async () => {
    renderWithHeader('/recruiter/portal?tab=talent&skills=reactjs&role=Frontend');
    const header = screen.getByRole('banner');

    expect(await within(header).findByRole('link', { name: 'Ứng viên', current: 'page' })).toBeInTheDocument();
    expect(within(header).getByRole('heading', { level: 1, name: 'Tuyển dụng' })).toBeInTheDocument();
    expect(within(header).getByText('Công ty Acme')).toBeInTheDocument();
    expect(within(header).getAllByRole('link')).toHaveLength(3);
    expect(within(header).getByRole('link', { name: 'Công ty', current: false })).toBeInTheDocument();
    // Mở thẻ mới (chuột giữa / Ctrl+click) phải ra ĐÚNG URL mà cú bấm thường dựng — không mang bộ lọc ứng viên sang.
    const offers = within(header).getByRole('link', { name: 'Lời mời', current: false });
    expect(offers).toHaveAttribute('href', expect.stringContaining('tab=offers'));
    expect(offers.getAttribute('href')).not.toMatch(/skills|role/);
  });

  it('chưa có doanh nghiệp (404 RES_001) → header chỉ còn bảng tên, KHÔNG có chip tab', async () => {
    meFailure = { status: 404, code: 'RES_001' };
    renderWithHeader('/recruiter/portal');

    expect(await screen.findByText('Bạn chưa có doanh nghiệp')).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('heading', { level: 1, name: 'Tuyển dụng' })).toBeInTheDocument();
    expect(within(header).queryAllByRole('link')).toHaveLength(0);
  });
});
