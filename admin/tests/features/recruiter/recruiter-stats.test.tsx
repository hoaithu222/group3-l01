/**
 * Tab `stats` của `/recruiter` (p6-08 admin.md §2.2): KPI (đếm hiện tại + theo khoảng ngày), bảng số liệu theo tháng (thay thế biểu đồ), top doanh nghiệp,
 * khoảng ngày trên URL (sai/quá dài → cảnh báo và KHÔNG gọi BE), lỗi tải (KPI "—", không "0").
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RecruiterStatsPanel from '@/features/recruiter/components/RecruiterStatsPanel';
import type { RecruiterStats } from '@/features/recruiter/types/recruiter.types';

import { errorBody, makeItem, okBody, pageMeta, PERM_VIEW, renderAt, signInOps } from './recruiter-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let statsCalls: URL[] = [];
let stats: RecruiterStats;
let statsFailure = false;

const server = setupServer(
  http.get('*/admin/recruiter/stats', ({ request }) => {
    statsCalls.push(new URL(request.url));
    return statsFailure ? errorBody(500, 'SYS_001', 'lỗi') : okBody(stats);
  }),
  http.get('*/admin/companies', ({ request }) => {
    const status = new URL(request.url).searchParams.get('status');
    return okBody([makeItem()], pageMeta(status === 'APPROVED' ? 7 : 2, 1, 1));
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
  statsCalls = [];
  statsFailure = false;
  stats = {
    byMonth: [
      { period: '2026-08', sent: 20, read: 10, interested: 4, declined: 3, expired: 1 },
      { period: '2026-09', sent: 30, read: 20, interested: 6, declined: 2, expired: 0 },
    ],
    topCompanies: [
      { companyId: '665f1c2e8a1b2c3d4e5f6b01', name: 'Công ty Acme', sent: 35 },
      { companyId: '665f1c2e8a1b2c3d4e5f6b09', name: 'Công ty Beta', sent: 15 },
    ],
    companiesAtQuota: 1,
    openToWorkCount: 42,
  };
  signInOps(PERM_VIEW);
});

/** Thẻ KPI theo nhãn — nhãn có thể trùng chữ với tiêu đề cột của bảng (vd "Lời mời đã gửi"), lấy phần tử ĐẦU (dải KPI nằm trên cùng). */
const kpi = (label: string) => screen.getAllByText(label)[0].closest('div')?.parentElement as HTMLElement;

describe('thống kê tuyển dụng', () => {
  it('gửi from/to/tz Asia/Ho_Chi_Minh; KPI tổng hợp đúng: đã duyệt, chờ duyệt, Open to work, đã gửi, tỉ lệ đã xem/quan tâm', async () => {
    renderAt(<RecruiterStatsPanel />, '/recruiter?tab=stats&from=2026-07-01&to=2026-09-26');

    await waitFor(() => expect(statsCalls).toHaveLength(1));
    expect(statsCalls[0].searchParams.get('tz')).toBe('Asia/Ho_Chi_Minh');
    expect(statsCalls[0].searchParams.get('from')).toBeTruthy();
    expect(statsCalls[0].searchParams.get('to')).toBeTruthy();

    // 20+30 = 50 đã gửi; đã xem 30/50 = 60%; quan tâm 10/50 = 20%.
    await waitFor(() => expect(within(kpi('Lời mời đã gửi')).getByText('50')).toBeInTheDocument());
    expect(within(kpi('Tỉ lệ đã xem')).getByText('60%')).toBeInTheDocument();
    expect(within(kpi('Tỉ lệ quan tâm')).getByText('20%')).toBeInTheDocument();
    expect(within(kpi('Ứng viên Open to work')).getByText('42')).toBeInTheDocument();
    await waitFor(() => expect(within(kpi('Doanh nghiệp đã duyệt')).getByText('7')).toBeInTheDocument());
    expect(within(kpi('Chờ duyệt')).getByText('2')).toBeInTheDocument();
  });

  it('bảng thay thế theo tháng + top doanh nghiệp (liên kết sang ngăn kéo, không có tên ứng viên)', async () => {
    renderAt(<RecruiterStatsPanel />, '/recruiter?tab=stats&from=2026-07-01&to=2026-09-26');

    expect(await screen.findByText('08/2026')).toBeInTheDocument();
    expect(screen.getByText('09/2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Công ty Acme' })).toHaveAttribute(
      'href',
      '/recruiter?tab=companies&status=all&companyId=665f1c2e8a1b2c3d4e5f6b01',
    );
    expect(screen.getByText('1 doanh nghiệp đã chạm hạn mức tháng này')).toBeInTheDocument();
  });

  it('chưa gửi lời mời nào → tỉ lệ là "—", KHÔNG phải "0%"', async () => {
    stats = { ...stats, byMonth: [] };
    renderAt(<RecruiterStatsPanel />, '/recruiter?tab=stats&from=2026-07-01&to=2026-09-26');

    await waitFor(() => expect(within(kpi('Tỉ lệ quan tâm')).getByText('—')).toBeInTheDocument());
    expect(within(kpi('Tỉ lệ đã xem')).queryByText('0%')).not.toBeInTheDocument();
    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument();
  });

  it('khoảng > 366 ngày → cảnh báo và KHÔNG gọi BE (BE chắc chắn từ chối)', async () => {
    renderAt(<RecruiterStatsPanel />, '/recruiter?tab=stats&from=2025-01-01&to=2026-09-26');

    expect(await screen.findByText('Khoảng ngày không hợp lệ')).toBeInTheDocument();
    expect(screen.getByText(/tối đa 366 ngày/)).toBeInTheDocument();
    expect(statsCalls).toEqual([]);
  });

  it('khoảng đảo ngược → cảnh báo và KHÔNG gọi BE', async () => {
    renderAt(<RecruiterStatsPanel />, '/recruiter?tab=stats&from=2026-09-26&to=2026-07-01');

    expect(await screen.findByText('Khoảng ngày không hợp lệ')).toBeInTheDocument();
    expect(statsCalls).toEqual([]);
  });

  it('BE lỗi → Callout "Thử lại" và KPI theo khoảng hiện "—" (không "0")', async () => {
    statsFailure = true;
    renderAt(<RecruiterStatsPanel />, '/recruiter?tab=stats&from=2026-07-01&to=2026-09-26');

    expect(await screen.findByText('Không tải được thống kê')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(within(kpi('Lời mời đã gửi')).getByText('—')).toBeInTheDocument();
    expect(within(kpi('Ứng viên Open to work')).getByText('—')).toBeInTheDocument();
  });
});
