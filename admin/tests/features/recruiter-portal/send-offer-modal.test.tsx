/**
 * Modal "Gửi lời mời" (p6-08 admin.md §2.5, §4): ràng buộc khớp BE, `Idempotency-Key`, hạn mức tháng, và ba lỗi có thông điệp riêng:
 * `RECR_005` (hết lượt: hiện hạn mức + đề xuất nâng gói, GIỮ nội dung) · `RECR_006` / `RECR_007` (thông điệp tiếng Việt rồi ĐÓNG).
 * Khoá idempotency: GIỮ khi thử lại sau lỗi mạng, ĐỔI sau kết luận 4xx (BE lưu phản hồi 4xx theo khoá).
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RecruiterPortalPage from '@/features/recruiter-portal/pages/RecruiterPortalPage';
import type { TalentProfile } from '@/features/recruiter-portal/types/talent.types';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { cursorMeta, errorBody, makeMe, makeOfferDetail, makeProfile, makeTalent, okBody, renderAt, signInHr, STUDENT_ID } from './portal-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

interface SendCall {
  key: string | null;
  body: Record<string, unknown>;
}
type Behaviour = 'created' | 'network' | { status: number; code: string; details?: unknown };

let sends: SendCall[] = [];
let behaviours: Behaviour[] = [];
let profile: TalentProfile;
let profileHits = 0;
let usage = { period: '2026-09', used: 2, quota: 5, remaining: 3, tier: 'FREE' };

const server = setupServer(
  http.get('*/me/company', () => okBody(makeMe('APPROVED'))),
  http.get('*/skills', () => okBody([])),
  http.get('*/companies/:id/talent/search', () => okBody([makeTalent()], cursorMeta())),
  http.get('*/companies/:id/talent/:userId', () => {
    profileHits += 1;
    return okBody(profile);
  }),
  http.get('*/companies/:id/usage', () => okBody(usage)),
  http.get('*/companies/:id/offers', () => okBody([], cursorMeta())),
  http.post('*/companies/:id/offers', async ({ request }) => {
    sends.push({ key: request.headers.get('Idempotency-Key'), body: (await request.json()) as Record<string, unknown> });
    const next = behaviours.shift() ?? 'created';
    if (next === 'created') return HttpResponse.json({ success: true, data: makeOfferDetail() }, { status: 201 });
    if (next === 'network') return HttpResponse.error();
    return errorBody(next.status, next.code, 'Thông điệp từ BE', next.details);
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
  sends = [];
  behaviours = [];
  profile = makeProfile();
  profileHits = 0;
  usage = { period: '2026-09', used: 2, quota: 5, remaining: 3, tier: 'FREE' };
  useToastStore.setState({ toasts: [] });
  signInHr();
});

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const TITLE = 'Thực tập Frontend mùa thu';
const MESSAGE = 'Chào bạn, chúng tôi muốn mời bạn thực tập tại Acme.';

async function openModal() {
  renderAt(<RecruiterPortalPage />, `/recruiter/portal?tab=talent&userId=${STUDENT_ID}`);
  const drawer = await screen.findByRole('dialog', { name: 'Lê Minh Châu' });
  await userEvent.click(await within(drawer).findByRole('button', { name: 'Gửi lời mời' }));
  return screen.findByRole('dialog', { name: /Gửi lời mời — Lê Minh Châu/ });
}

async function fillAndSubmit(dialog: HTMLElement) {
  const title = within(dialog).getByLabelText(/Tiêu đề/);
  const message = within(dialog).getByLabelText(/Nội dung lời mời/);
  await userEvent.clear(title);
  await userEvent.type(title, TITLE);
  await userEvent.clear(message);
  await userEvent.type(message, MESSAGE);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi lời mời' }));
}

describe('nhập liệu', () => {
  it('hiện "Còn N/M lượt" và lời nhắc chỉ trao đổi sau khi Quan tâm', async () => {
    const dialog = await openModal();

    expect(await within(dialog).findByText(/Còn 3\/5 lượt gửi lời mời trong tháng này/)).toBeInTheDocument();
    expect(within(dialog).getByText(/chỉ trao đổi được với bạn sau khi bấm Quan tâm/)).toBeInTheDocument();
  });

  it('tiêu đề < 3 và nội dung < 20 ký tự → báo lỗi, KHÔNG gọi API', async () => {
    const dialog = await openModal();

    await userEvent.type(within(dialog).getByLabelText(/Tiêu đề/), 'ab');
    await userEvent.type(within(dialog).getByLabelText(/Nội dung lời mời/), 'ngắn quá');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi lời mời' }));

    expect(await within(dialog).findByText('Tiêu đề tối thiểu 3 ký tự')).toBeInTheDocument();
    expect(within(dialog).getByText('Nội dung tối thiểu 20 ký tự')).toBeInTheDocument();
    expect(sends).toEqual([]);
  });
});

describe('gửi thành công', () => {
  it('POST kèm Idempotency-Key (8–128 ký tự), body đúng DTO KHÔNG có trường tuỳ chọn trống; đóng modal, "Xem lời mời" hiện ngay, KHÔNG tải lại hồ sơ', async () => {
    const dialog = await openModal();
    await fillAndSubmit(dialog);

    await waitFor(() => expect(sends).toHaveLength(1));
    expect(sends[0].key).toMatch(/^.{8,128}$/);
    expect(sends[0].body).toEqual({ studentId: STUDENT_ID, title: TITLE, message: MESSAGE, employmentType: 'INTERNSHIP' });
    await waitFor(() => expect(toastTitles()).toContain('Đã gửi lời mời'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Gửi lời mời — / })).not.toBeInTheDocument());

    // Hồ sơ trong cache được VÁ tại chỗ — nút đổi thành "Xem lời mời" mà không tốn thêm một lượt xem (nhật ký + trần 300/ngày).
    const drawer = screen.getByRole('dialog', { name: 'Lê Minh Châu' });
    expect(await within(drawer).findByRole('link', { name: 'Xem lời mời' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Gửi lời mời' })).not.toBeInTheDocument();
    expect(profileHits).toBe(1);
  });
});

describe('lỗi có thông điệp riêng', () => {
  it('RECR_005 (hết lượt tháng) → hiện hạn mức + đề xuất nâng gói TRONG modal, giữ nguyên nội dung đang soạn', async () => {
    behaviours = [{ status: 429, code: 'RECR_005', details: { period: '2026-09', used: 5, quota: 5 } }];
    const dialog = await openModal();
    await fillAndSubmit(dialog);

    expect(await within(dialog).findByText('Đã hết lượt gửi lời mời')).toBeInTheDocument();
    expect(within(dialog).getByText(/đã dùng 5\/5 lượt trong tháng 2026-09.*nâng gói/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Gửi lời mời — / })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Tiêu đề/)).toHaveValue(TITLE);
    expect(within(dialog).getByLabelText(/Nội dung lời mời/)).toHaveValue(MESSAGE);
  });

  it('RECR_006 (đã có lời mời mở) → thông điệp tiếng Việt rồi ĐÓNG modal', async () => {
    behaviours = [{ status: 409, code: 'RECR_006' }];
    const dialog = await openModal();
    await fillAndSubmit(dialog);

    await waitFor(() => expect(toastTitles()).toContain('Đã có lời mời đang mở với ứng viên này. Xem trong tab Lời mời.'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Gửi lời mời — / })).not.toBeInTheDocument());
  });

  it('RECR_007 (không thể gửi) → thông điệp CHUNG không lộ lý do, rồi ĐÓNG modal', async () => {
    behaviours = [{ status: 422, code: 'RECR_007' }];
    const dialog = await openModal();
    await fillAndSubmit(dialog);

    await waitFor(() => expect(toastTitles()).toContain('Không thể gửi lời mời cho ứng viên này.'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Gửi lời mời — / })).not.toBeInTheDocument());
  });
});

describe('Idempotency-Key', () => {
  it('sau lỗi MẠNG (chưa có kết luận) → thử lại DÙNG LẠI khoá cũ (BE trả lời mời đã tạo thay vì tạo trùng)', async () => {
    behaviours = ['network', 'created'];
    const dialog = await openModal();
    await fillAndSubmit(dialog);
    await waitFor(() => expect(sends).toHaveLength(1));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi lời mời' }));

    await waitFor(() => expect(sends).toHaveLength(2));
    expect(sends[1].key).toBe(sends[0].key);
  });

  it('sau kết luận 4xx (BE lưu phản hồi theo khoá) → lần gửi sau nội dung đã sửa DÙNG KHOÁ MỚI', async () => {
    behaviours = [{ status: 400, code: 'VAL_001' }, 'created'];
    const dialog = await openModal();
    await fillAndSubmit(dialog);
    await waitFor(() => expect(sends).toHaveLength(1));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi lời mời' }));

    await waitFor(() => expect(sends).toHaveLength(2));
    expect(sends[1].key).not.toBe(sends[0].key);
    expect(sends[1].key).toMatch(/^.{8,128}$/);
  });
});
