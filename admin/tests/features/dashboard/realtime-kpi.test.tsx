/**
 * `OverviewKpiStrip` — 2 thẻ realtime (p0-03) đọc `realtime.{socketConnections,
 * onlineUsers}` từ `GET /admin/overview`. Chỉ hiện SỐ ĐẾM — KHÔNG hiện danh
 * sách/tên người dùng trực tuyến (quyền riêng tư, `admin.md` §2).
 *
 * `loading` truyền `true` để tắt hiệu ứng đếm số (`CompactKpiCard.animate`) —
 * giá trị hiện NGAY, không phụ thuộc `requestAnimationFrame` trong jsdom.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AdminOverview } from '@/core/api/admin';

vi.mock('@/app/capabilities', () => ({ useFeature: () => true }));
vi.mock('@/app/router/modules/module-registry', () => ({ MODULE_BY_ID: {} }));

const { default: OverviewKpiStrip } = await import(
  '@/features/dashboard/components/OverviewKpiStrip'
);

const baseData: AdminOverview = {
  activeUsersSeries: [],
  activeWorkspaces: 3,
  failedAiJobs24h: 0,
  newUsers7d: 12,
  openReports: 1,
  realtime: { onlineUsers: 7, socketConnections: 42 },
};

describe('OverviewKpiStrip — KPI realtime', () => {
  it('hiện đúng số kết nối realtime và người dùng trực tuyến', () => {
    render(<OverviewKpiStrip data={baseData} loading />);

    // `CompactKpiCard` in giá trị hai lần (span hiện + span `.sr-only` cho a11y) —
    // dùng `getAllByText` thay vì `getByText`.
    expect(screen.getByText('Kết nối realtime')).toBeInTheDocument();
    expect(screen.getByText('Người dùng trực tuyến')).toBeInTheDocument();
    expect(screen.getAllByText('42').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
  });

  it('data chưa có (đang tải lần đầu / lỗi) ⇒ hiện "—", KHÔNG phải số 0 giả, KHÔNG crash', () => {
    render(<OverviewKpiStrip data={undefined} loading />);

    expect(screen.getByText('Kết nối realtime')).toBeInTheDocument();
    expect(screen.getByText('Người dùng trực tuyến')).toBeInTheDocument();
    // Cả 6 thẻ đều "—". Trước đây rơi về `?? 0` nên sự cố API trông như "0 báo cáo chờ xử lý" — nói dối.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('số 0 THẬT (BE trả 0) vẫn hiện là 0, không bị nhầm với "chưa có số liệu"', () => {
    render(<OverviewKpiStrip data={{ ...baseData, failedAiJobs24h: 0, openReports: 0 }} loading />);

    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('KHÔNG hiện danh sách hay tên người dùng trực tuyến nào', () => {
    render(<OverviewKpiStrip data={baseData} loading />);

    // Hai thẻ realtime chỉ có nhãn + số đếm — không có <ul>/<table> liệt kê,
    // không có email/tên nào bị in ra (kiểm bằng ký tự "@" thường có trong email).
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
});
