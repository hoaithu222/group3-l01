/**
 * Nhóm "Tổng quan ẩn danh" (p7-03 admin.md §2.1, §4): chưa đủ mẫu → giải thích thay vì vẽ số (không chart, không thẻ `0`); đủ mẫu → số làm tròn kèm "≈", ô bị che hiện "—"
 * kèm chú thích khử nhận dạng, phân bố mức có nhóm "Khác"; khoảng tuần sống trên URL và đi cùng request; lỗi tải không vẽ số 0. MSW.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import WellbeingOverview from '@/features/wellbeing/components/WellbeingOverview';
import type { WellbeingOverview as OverviewData } from '@/features/wellbeing/types/wellbeing.types';

import {
  errorBody,
  makeInsufficient,
  makeOverview,
  okBody,
  renderAt,
  signIn,
  urlParam,
} from './wellbeing-fixtures';

let overview: OverviewData = makeOverview();
let weeksSeen: Array<string | null> = [];

const server = setupServer(
  http.get('*/admin/wellbeing/overview', ({ request }) => {
    weeksSeen.push(new URL(request.url).searchParams.get('weeks'));
    return okBody(overview);
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
  overview = makeOverview();
  weeksSeen = [];
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view']);
});

const URL_OVERVIEW = '/gamification?tab=wellbeing';

describe('WellbeingOverview — đủ mẫu', () => {
  it('số người bật hiện kèm "≈" và ghi rõ đã làm tròn; cảnh báo tuần này lấy tuần cuối', async () => {
    renderAt(<WellbeingOverview />, URL_OVERVIEW);

    expect(await screen.findByText('≈ 120')).toBeInTheDocument();
    expect(screen.getByText('Làm tròn tới chục — không phải số chính xác')).toBeInTheDocument();
    expect(screen.getByText('Cảnh báo tuần này')).toBeInTheDocument();
    expect(screen.getByText('Tuần bắt đầu 21/09/2026')).toBeInTheDocument();
    expect(weeksSeen).toEqual(['12']);
  });

  it('bảng cảnh báo theo tuần: ô bị che hiện "—" (không phải 0) kèm chú thích; tuần không có cảnh báo hiện 0 thật', async () => {
    renderAt(<WellbeingOverview />, URL_OVERVIEW);
    await screen.findByText('≈ 120');

    const table = screen.getByText('Số liệu theo tuần').parentElement as HTMLElement;
    const rowOf = (weekStart: string) =>
      within(table)
        .getAllByRole('row')
        .find((r) => within(r).queryByText(weekStart)) as HTMLElement;

    // Mới nhất trước: hàng đầu = tuần hiện tại (8 cảnh báo).
    expect(within(within(table).getAllByRole('row')[1]).getByText('8')).toBeInTheDocument();
    // Tuần thứ 3 tính từ cũ có 1–4 cảnh báo → BE che (`null`) → "—", KHÔNG phải 0.
    expect(within(rowOf('20/07/2026')).getByText('—')).toBeInTheDocument();
    expect(within(rowOf('20/07/2026')).queryByText('0')).not.toBeInTheDocument();
    // Tuần đầu thật sự không có cảnh báo → 0.
    expect(within(rowOf('06/07/2026')).getByText('0')).toBeInTheDocument();
    expect(
      screen.getByText(/con số bị ẩn để không ai có thể nhận ra một cá nhân/),
    ).toBeInTheDocument();
  });

  it('phân bố mức: đủ số người + tỉ lệ, nhóm "Khác" kèm giải thích vì sao gộp', async () => {
    renderAt(<WellbeingOverview />, URL_OVERVIEW);
    await screen.findByText('≈ 120');

    const table = screen.getByText('Số liệu theo mức').parentElement as HTMLElement;
    expect(within(table).getByText('Thấp')).toBeInTheDocument();
    expect(within(table).getByText('Trung bình')).toBeInTheDocument();
    expect(within(table).getByText('Khác')).toBeInTheDocument();
    expect(within(table).getByText('70')).toBeInTheDocument();
    expect(within(table).queryByText('Cao')).not.toBeInTheDocument(); // nhóm Cao quá nhỏ nên BE đã gộp vào "Khác"
    expect(screen.getByText(/các nhóm quá nhỏ được gộp lại/)).toBeInTheDocument();
  });

  it('BE chưa công bố phân bố (`null`) → khung ghi "Chưa đủ dữ liệu ẩn danh", không vẽ biểu đồ', async () => {
    overview = makeOverview({ levelDistribution: null });
    renderAt(<WellbeingOverview />, URL_OVERVIEW);

    expect(await screen.findByText('Chưa đủ dữ liệu ẩn danh')).toBeInTheDocument();
    expect(screen.queryByText('Số liệu theo mức')).not.toBeInTheDocument();
  });

  it('toàn tuần không có cảnh báo (0) → "Chưa có dữ liệu" thay vì cột phẳng; ô che (1–4) vẫn tính là CÓ cảnh báo', async () => {
    overview = makeOverview({ alertsPerWeek: [{ weekStart: '2026-09-21', alerts: 0 }] });
    renderAt(<WellbeingOverview />, URL_OVERVIEW);
    expect(
      await screen.findByText('Chưa có cảnh báo nào trong khoảng đã chọn.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Số liệu theo tuần')).not.toBeInTheDocument();
  });

  it('đổi khoảng: ghi ?weeks= (mặc định 12 thì xoá khoá) và gửi đúng `weeks`; ?weeks= lạ → 12', async () => {
    const { router } = renderAt(<WellbeingOverview />, URL_OVERVIEW);
    await screen.findByText('≈ 120');

    await userEvent.click(screen.getByRole('button', { name: '4 tuần' }));
    await waitFor(() => expect(urlParam(router, 'weeks')).toBe('4'));
    await waitFor(() => expect(weeksSeen).toContain('4'));

    await userEvent.click(screen.getByRole('button', { name: '12 tuần' }));
    await waitFor(() => expect(urlParam(router, 'weeks')).toBeNull());
  });

  it('?weeks=99 (URL sửa tay) → dùng 12', async () => {
    renderAt(<WellbeingOverview />, `${URL_OVERVIEW}&weeks=99`);
    await screen.findByText('≈ 120');
    expect(weeksSeen).toEqual(['12']);
  });
});

describe('WellbeingOverview — chưa đủ mẫu', () => {
  it('nói "cần ít nhất N người" ở thẻ và khung giải thích; KHÔNG có bảng/biểu đồ và KHÔNG có con số nào', async () => {
    overview = makeInsufficient(20);
    renderAt(<WellbeingOverview />, URL_OVERVIEW);

    expect(
      await screen.findByText('Chưa đủ người tham gia — cần ít nhất 20 người'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Chưa đủ mẫu')).toHaveLength(2);
    expect(
      screen.getByText('Cần ít nhất 20 người bật theo dõi mới hiển thị số liệu ẩn danh', {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Số liệu theo tuần')).not.toBeInTheDocument();
    expect(screen.queryByText('Số liệu theo mức')).not.toBeInTheDocument();
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('`minimum` do BE quyết định (không cứng 20 ở giao diện)', async () => {
    overview = makeInsufficient(30);
    renderAt(<WellbeingOverview />, URL_OVERVIEW);
    expect(
      await screen.findByText('Chưa đủ người tham gia — cần ít nhất 30 người'),
    ).toBeInTheDocument();
  });
});

describe('WellbeingOverview — lỗi tải', () => {
  it('lỗi 5xx → "Không tải được tổng quan" + Thử lại; thẻ hiện "—", KHÔNG vẽ 0', async () => {
    server.use(
      http.get('*/admin/wellbeing/overview', () => errorBody(500, 'SYS_001', 'Lỗi máy chủ')),
    );
    renderAt(<WellbeingOverview />, URL_OVERVIEW);

    expect(
      await screen.findByText('Không tải được tổng quan sức khoẻ học tập'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('403 → nói thiếu quyền, KHÔNG có nút Thử lại', async () => {
    server.use(
      http.get('*/admin/wellbeing/overview', () => errorBody(403, 'AUTH_003', 'Không đủ quyền')),
    );
    renderAt(<WellbeingOverview />, URL_OVERVIEW);

    expect(
      await screen.findByText('Tài khoản của bạn chưa có quyền xem dữ liệu này.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});
