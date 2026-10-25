/**
 * Ngăn kéo hồ sơ ứng viên (p6-08 admin.md §2.4, §4): huy hiệu + minh chứng đã lọc theo người xem, ghi chú "lượt xem được ghi nhận", lời mời đang mở,
 * 404 (ứng viên vừa tắt Open to work) → toast + ĐÓNG + làm mới danh sách, `RECR_010` → banner đếm ngược. Hồ sơ KHÔNG bị tải lại ngầm (mỗi lần tải là một dòng nhật ký + một lượt trong trần/ngày).
 */
import { act, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RecruiterPortalPage from '@/features/recruiter-portal/pages/RecruiterPortalPage';
import type { MyCompany } from '@/features/recruiter-portal/types/portal.types';
import type { TalentProfile, TalentProof } from '@/features/recruiter-portal/types/talent.types';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { cursorMeta, errorBody, makeMe, makeProfile, makeTalent, okBody, OFFER_ID, renderAt, signInHr, STUDENT_ID } from './portal-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let me: MyCompany;
let profile: TalentProfile;
let profileFailure: { status: number; code: string; details?: unknown } | null = null;
let searchHits = 0;
let profileHits = 0;
let proofHits = 0;
let proof: TalentProof;

const server = setupServer(
  http.get('*/me/company', () => okBody(me)),
  http.get('*/skills', () => okBody([{ code: 'reactjs', name: 'React' }])),
  http.get('*/companies/:id/talent/search', () => {
    searchHits += 1;
    return okBody([makeTalent()], cursorMeta());
  }),
  http.get('*/companies/:id/talent/:userId/skills/:skillId/proof', () => {
    proofHits += 1;
    return okBody(proof);
  }),
  http.get('*/companies/:id/talent/:userId', () => {
    profileHits += 1;
    return profileFailure ? errorBody(profileFailure.status, profileFailure.code, 'lỗi', profileFailure.details) : okBody(profile);
  }),
  http.get('*/companies/:id/usage', () => okBody({ period: '2026-09', used: 2, quota: 5, remaining: 3, tier: 'FREE' })),
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
  profile = makeProfile();
  profileFailure = null;
  searchHits = 0;
  profileHits = 0;
  proofHits = 0;
  proof = {
    skill: { id: 's1', code: 'reactjs', name: 'React', description: null, category: 'FRONTEND', icon: 'code' },
    unlockedAt: '2026-08-01T00:00:00.000Z',
    revoked: false,
    tasksDone: 31,
    storyPoints: 64.5,
    avgPeerScore: 8.2,
    tasks: [
      { title: null, storyPoints: 5, completedAt: '2026-07-10T00:00:00.000Z', reviewScore: 9, workspaceName: null },
      { title: 'Xây trang đăng nhập', storyPoints: 3, completedAt: '2026-07-12T00:00:00.000Z', reviewScore: null, workspaceName: 'Nhóm Alpha' },
    ],
    verifiedBy: 'SYSTEM',
  };
  useToastStore.setState({ toasts: [] });
  signInHr();
});

const URL_OPEN = `/recruiter/portal?tab=talent&userId=${STUDENT_ID}`;
const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

describe('hồ sơ ứng viên', () => {
  it('hiện thẻ + huy hiệu + ghi chú lượt xem được ghi nhận; gọi hồ sơ ĐÚNG MỘT lần', async () => {
    renderAt(<RecruiterPortalPage />, URL_OPEN);

    const drawer = await screen.findByRole('dialog', { name: 'Lê Minh Châu' });
    expect(await within(drawer).findByText('Kỹ năng đã xác thực')).toBeInTheDocument();
    expect(within(drawer).getByText('Frontend')).toBeInTheDocument();
    expect(within(drawer).getByText(/Cấp 01\/08\/2026 · 31 task/)).toBeInTheDocument();
    expect(within(drawer).getByText(/Lượt xem hồ sơ được ghi nhận/)).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Gửi lời mời' })).toBeInTheDocument();
    // Không email/SĐT ở bất cứ đâu.
    expect(drawer.textContent).not.toMatch(/\S+@\S+\.\S+/);
    await waitFor(() => expect(profileHits).toBe(1));
  });

  it('không tải lại ngầm khi đang mở, nhưng ĐÓNG rồi MỞ LẠI là một lượt xem mới (audit mọi lượt xem)', async () => {
    const { router } = renderAt(<RecruiterPortalPage />, URL_OPEN);
    await screen.findByRole('dialog', { name: 'Lê Minh Châu' });
    await waitFor(() => expect(profileHits).toBe(1));
    await act(() => new Promise((r) => setTimeout(r, 200)));
    expect(profileHits).toBe(1);

    await act(() => router.navigate('/recruiter/portal?tab=talent'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Lê Minh Châu' })).not.toBeInTheDocument());
    await act(() => router.navigate(URL_OPEN));

    await screen.findByRole('dialog', { name: 'Lê Minh Châu' });
    await waitFor(() => expect(profileHits).toBe(2));
  });

  it('"Xem minh chứng" → tiêu đề task/tên nhóm ẨN (null) được nói rõ "theo cài đặt của ứng viên"', async () => {
    renderAt(<RecruiterPortalPage />, URL_OPEN);
    const drawer = await screen.findByRole('dialog', { name: 'Lê Minh Châu' });
    expect(proofHits).toBe(0);

    await userEvent.click(await within(drawer).findByRole('button', { name: 'Xem minh chứng' }));

    const proofDrawer = await screen.findByRole('dialog', { name: 'Minh chứng · React' });
    expect(within(proofDrawer).getByText('Tiêu đề được ẩn theo cài đặt của ứng viên')).toBeInTheDocument();
    expect(within(proofDrawer).getByText('Xây trang đăng nhập')).toBeInTheDocument();
    expect(within(proofDrawer).getByText(/Nhóm Alpha/)).toBeInTheDocument();
    expect(proofHits).toBe(1);
  });

  it('đã có lời mời ĐANG MỞ → không nút "Gửi lời mời", có "Xem lời mời" trỏ tới tab Lời mời', async () => {
    profile = makeProfile({ openOffer: { id: OFFER_ID, status: 'READ', sentAt: '2026-09-20T03:00:00.000Z' } });
    renderAt(<RecruiterPortalPage />, URL_OPEN);

    const drawer = await screen.findByRole('dialog', { name: 'Lê Minh Châu' });
    const link = await within(drawer).findByRole('link', { name: 'Xem lời mời' });
    expect(link.getAttribute('href')).toContain(`tab=offers&offerId=${OFFER_ID}`);
    expect(within(drawer).getByText(/Đã xem/)).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Gửi lời mời' })).not.toBeInTheDocument();
  });

  it('thiếu quyền gửi lời mời (company.offer) → ẩn nút', async () => {
    me = { ...makeMe('APPROVED'), permissions: ['company.view', 'company.talent'] };
    renderAt(<RecruiterPortalPage />, URL_OPEN);

    const drawer = await screen.findByRole('dialog', { name: 'Lê Minh Châu' });
    await within(drawer).findByText('Kỹ năng đã xác thực');
    expect(within(drawer).queryByRole('button', { name: 'Gửi lời mời' })).not.toBeInTheDocument();
  });
});

describe('lỗi khi mở hồ sơ', () => {
  it('404 (ứng viên vừa tắt Open to work/chặn công ty) → toast "Ứng viên không còn hiển thị", ĐÓNG ngăn kéo, làm mới danh sách', async () => {
    profileFailure = { status: 404, code: 'RES_001' };
    const { router } = renderAt(<RecruiterPortalPage />, URL_OPEN);

    await waitFor(() => expect(toastTitles()).toContain('Ứng viên không còn hiển thị'));
    await waitFor(() => expect(router.state.location.search).not.toContain('userId'));
    // Lượt tìm đầu tiên + MỘT lượt làm mới sau khi ứng viên biến mất (thiếu làm mới thì chỉ có 1).
    await waitFor(() => expect(searchHits).toBeGreaterThanOrEqual(2));
    // Ngăn kéo có hoạt ảnh đóng (Radix Presence) nên biến khỏi DOM sau một nhịp — chờ thay vì khẳng định ngay.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Hồ sơ ứng viên|Lê Minh Châu/ })).not.toBeInTheDocument());
  });

  it('RECR_010 (quá 300 lượt/ngày) → đóng ngăn kéo, banner đếm ngược theo retryAfterSeconds', async () => {
    profileFailure = { status: 429, code: 'RECR_010', details: { retryAfterSeconds: 125 } };
    const { router } = renderAt(<RecruiterPortalPage />, URL_OPEN);

    expect(await screen.findByText('Đã đạt giới hạn xem hồ sơ trong ngày')).toBeInTheDocument();
    expect(screen.getByText(/Có thể xem tiếp sau 2:0\d/)).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).not.toContain('userId'));
    // Danh sách vẫn còn — banner không xoá lưới kết quả.
    expect(screen.getByText('Lê Minh Châu')).toBeInTheDocument();
  });

  it('lỗi tạm thời (5xx) → Callout "Thử lại", không toast "không còn hiển thị"', async () => {
    profileFailure = { status: 500, code: 'SYS_001' };
    renderAt(<RecruiterPortalPage />, URL_OPEN);

    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('Không tải được hồ sơ ứng viên')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(toastTitles()).not.toContain('Ứng viên không còn hiển thị');
  });
});
