/**
 * Tab Ứng viên (p6-08 admin.md §2.4, §4): bộ lọc ĐỒNG BỘ URL (F5 giữ nguyên), gửi đúng tham số cho BE, thẻ ứng viên KHÔNG có email (fixture có `email` cũng bị bỏ qua ở mapper),
 * portfolio chỉ là liên kết khi http(s), trạng thái rỗng/lỗi, "Tải thêm" theo cursor.
 */
import { act, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RecruiterPortalPage from '@/features/recruiter-portal/pages/RecruiterPortalPage';
import type { TalentCard } from '@/features/recruiter-portal/types/talent.types';

import { cursorMeta, errorBody, makeMe, makeTalent, okBody, renderAt, signInHr } from './portal-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let searchCalls: URL[] = [];
let pages: Array<{ data: TalentCard[]; next: string | null }> = [];
let searchFailure = false;

const server = setupServer(
  http.get('*/me/company', () => okBody(makeMe('APPROVED'))),
  http.get('*/skills', () =>
    okBody([
      { code: 'reactjs', name: 'React', myProgress: { tasksDone: 9 } },
      { code: 'nodejs', name: 'Node.js', myProgress: { tasksDone: 1 } },
    ]),
  ),
  http.get('*/companies/:id/talent/search', ({ request }) => {
    const url = new URL(request.url);
    searchCalls.push(url);
    if (searchFailure) return errorBody(500, 'SYS_001', 'lỗi');
    const index = url.searchParams.has('cursor') ? 1 : 0;
    const page = pages[index] ?? { data: [], next: null };
    return okBody(page.data, cursorMeta(page.next));
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
  searchCalls = [];
  searchFailure = false;
  pages = [{ data: [makeTalent()], next: null }];
  signInHr();
});

const last = () => searchCalls[searchCalls.length - 1];
const settle = () => act(() => new Promise((r) => setTimeout(r, 600)));

describe('bộ lọc đồng bộ URL', () => {
  it('URL có đủ bộ lọc (như sau F5) → BE nhận đúng tham số; kỹ năng gửi dạng CSV mã', async () => {
    renderAt(
      <RecruiterPortalPage />,
      '/recruiter/portal?tab=talent&skills=reactjs,nodejs&minContribution=20&minBadges=2&role=Frontend&location=H%C3%A0%20N%E1%BB%99i&q=chau',
    );

    expect(await screen.findByText('Lê Minh Châu')).toBeInTheDocument();
    const p = last().searchParams;
    expect(p.get('skills')).toBe('reactjs,nodejs');
    expect(p.get('minContribution')).toBe('20');
    expect(p.get('minBadges')).toBe('2');
    expect(p.get('role')).toBe('Frontend');
    expect(p.get('location')).toBe('Hà Nội');
    expect(p.get('q')).toBe('chau');
    expect(p.get('limit')).toBe('20');
    // Bộ lọc hiện đúng trên giao diện, nhãn kỹ năng lấy từ danh mục.
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Frontend')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hà Nội')).toBeInTheDocument();
  });

  it('giá trị URL sai dạng bị bỏ, không gửi cho BE (mã kỹ năng lạ, số ngoài khoảng, từ khoá 1 ký tự)', async () => {
    renderAt(
      <RecruiterPortalPage />,
      '/recruiter/portal?tab=talent&skills=REACT!,x&minContribution=500&minBadges=abc&q=a',
    );

    await screen.findByText('Lê Minh Châu');
    const p = last().searchParams;
    for (const key of ['skills', 'minContribution', 'minBadges', 'q']) expect(p.has(key)).toBe(false);
  });

  it('gõ vào ô vị trí → URL có role NGAY, BE nhận sau debounce (một lượt, không mỗi phím một lượt)', async () => {
    const { router } = renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=talent');
    await screen.findByText('Lê Minh Châu');
    const before = searchCalls.length;

    await userEvent.type(screen.getByLabelText('Vị trí mong muốn'), 'Backend');

    await waitFor(() => expect(router.state.location.search).toContain('role=Backend'));
    await waitFor(() => expect(searchCalls.some((u) => u.searchParams.get('role') === 'Backend')).toBe(true));
    await settle();
    // Debounce 400 ms: 7 phím nhưng chỉ vài lượt gọi, không phải 7.
    expect(searchCalls.length - before).toBeLessThan(4);
  });

  it('"Xoá bộ lọc" → URL sạch khoá lọc (giữ tab) và tìm lại không có tham số lọc', async () => {
    const { router } = renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=talent&skills=reactjs&minBadges=2&role=Frontend');
    await screen.findByText('Lê Minh Châu');

    await userEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    await waitFor(() => expect(router.state.location.search).not.toContain('skills'));
    expect(router.state.location.search).not.toContain('role');
    expect(router.state.location.search).toContain('tab=talent');
    await waitFor(() => expect(last().searchParams.has('skills')).toBe(false));
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument();
  });
});

describe('thẻ ứng viên', () => {
  it('hiện tên, tiêu đề, vị trí/khu vực, chip kỹ năng (khớp bộ lọc TÔ ĐẬM), số huy hiệu, % đóng góp kèm số nhóm, portfolio mở tab mới', async () => {
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=talent&skills=reactjs');

    const card = (await screen.findByText('Lê Minh Châu')).closest('li') as HTMLElement;
    expect(within(card).getByText('Sinh viên năm 4 — Frontend')).toBeInTheDocument();
    expect(within(card).getByText('Frontend · Hà Nội')).toBeInTheDocument();
    expect(within(card).getByText('2 huy hiệu')).toBeInTheDocument();
    expect(within(card).getByText('Đóng góp 42,5% trên 3 nhóm')).toBeInTheDocument();
    const link = within(card).getByRole('link', { name: 'Mở portfolio của Lê Minh Châu' });
    expect(link).toHaveAttribute('href', 'https://chau.dev/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // Khớp bộ lọc (React) dùng màu solid; Node.js chỉ tinted.
    expect(within(card).getByText('React').className).not.toBe(within(card).getByText('Node.js').className);
  });

  it('KHÔNG có email/SĐT/tên nhóm dù BE lỡ trả kèm; portfolio javascript: không thành liên kết; không % đóng góp khi ứng viên tắt', async () => {
    const leaky = {
      ...makeTalent({ contributionPct: undefined, contributionWorkspaces: undefined, portfolioUrl: 'javascript:alert(1)' }),
      email: 'chau-rieng-tu@gmail.com',
      phone: '0912345678',
      workspaceName: 'Nhóm Bí Mật',
    } as TalentCard;
    pages = [{ data: [leaky], next: null }];
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=talent');

    const card = (await screen.findByText('Lê Minh Châu')).closest('li') as HTMLElement;
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('chau-rieng-tu@gmail.com');
    expect(text).not.toContain('0912345678');
    expect(text).not.toContain('Nhóm Bí Mật');
    expect(screen.queryByRole('link', { name: /Mở portfolio/ })).not.toBeInTheDocument();
    // ("Đóng góp tối thiểu" là nhãn ô lọc — chỉ khẳng định TRONG thẻ.)
    expect(within(card).queryByText(/Đóng góp/)).not.toBeInTheDocument();
  });
});

describe('trạng thái kết quả', () => {
  it('rỗng → gợi ý nới bộ lọc', async () => {
    pages = [{ data: [], next: null }];
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=talent&skills=reactjs');

    expect(
      await screen.findByText('Không có ứng viên khớp bộ lọc. Thử bớt kỹ năng hoặc giảm đóng góp tối thiểu.'),
    ).toBeInTheDocument();
  });

  it('lỗi tải → Callout "Thử lại", KHÔNG vẽ "không có ứng viên"', async () => {
    searchFailure = true;
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=talent');

    expect(await screen.findByText('Không tải được danh sách ứng viên')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText(/Không có ứng viên khớp/)).not.toBeInTheDocument();
  });

  it('"Tải thêm" gửi cursor của trang trước rồi NỐI kết quả; hết trang thì ẩn nút', async () => {
    pages = [
      { data: [makeTalent()], next: 'cursor-trang-2' },
      { data: [makeTalent({ userId: '665f1c2e8a1b2c3d4e5f6d99', displayName: 'Phạm Quốc Dũng' })], next: null },
    ];
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=talent');
    await screen.findByText('Lê Minh Châu');

    await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));

    expect(await screen.findByText('Phạm Quốc Dũng')).toBeInTheDocument();
    expect(screen.getByText('Lê Minh Châu')).toBeInTheDocument();
    expect(last().searchParams.get('cursor')).toBe('cursor-trang-2');
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('tên ứng viên là liên kết thật mở ngăn kéo (giữ bộ lọc trong URL)', async () => {
    renderAt(<RecruiterPortalPage />, '/recruiter/portal?tab=talent&skills=reactjs');

    const link = await screen.findByRole('link', { name: 'Lê Minh Châu' });
    expect(link.getAttribute('href')).toContain('userId=');
    expect(link.getAttribute('href')).toContain('skills=reactjs');
  });
});
