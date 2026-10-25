/**
 * Nhóm "Tổng quan" của tab Kinh tế xu (p7-02 admin.md §2.1, §4): năm thẻ số liệu, đường phát hành/tiêu kèm BẢNG thay thế, top vật phẩm, cảnh báo đối soát,
 * khoảng ngày sống trên URL, chart rỗng → EmptyState (không vẽ đường phẳng), tải lỗi → báo lỗi + "Thử lại" (không vẽ thẻ 0). MSW.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import EconomyOverview from '@/features/economy/components/EconomyOverview';

import {
  errorBody,
  makeEmptyOverview,
  makeOverview,
  okBody,
  renderAt,
  signIn,
  urlParam,
  USER_ID,
} from './economy-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view']);
});

const URL_OVERVIEW = '/gamification?tab=economy';

function mockOverview(build: (days: number) => unknown = () => makeOverview()) {
  const days: number[] = [];
  server.use(
    http.get('*/admin/economy/overview', ({ request }) => {
      const d = Number(new URL(request.url).searchParams.get('days'));
      days.push(d);
      return okBody(build(d));
    }),
  );
  return days;
}

describe('EconomyOverview — số liệu', () => {
  it('hiện năm thẻ số liệu (vi-VN), bảng số liệu theo ngày thay thế biểu đồ và top vật phẩm', async () => {
    mockOverview();
    renderAt(<EconomyOverview />, URL_OVERVIEW);

    expect(await screen.findByText('1.200')).toBeInTheDocument(); // phát hành
    expect(screen.getByText('800')).toBeInTheDocument(); // đã tiêu
    expect(screen.getAllByText('−50').length).toBeGreaterThanOrEqual(1); // điều chỉnh ròng (dấu trừ thật; cũng có ở dòng bảng)
    expect(screen.getByText('34.500')).toBeInTheDocument(); // lưu hành
    for (const label of ['Xu phát hành', 'Xu đã tiêu', 'Xu bị đốt', 'Điều chỉnh ròng', 'Xu đang lưu hành']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    // Bảng theo ngày: 7 dòng, mới nhất trước.
    const table = screen.getByText('Số liệu theo ngày').parentElement!;
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(7);
    expect(within(rows[0]!).getByText('27/09/2026')).toBeInTheDocument();
    expect(within(rows[6]!).getByText('21/09/2026')).toBeInTheDocument();

    // Top vật phẩm
    expect(screen.getByText('Khung vàng')).toBeInTheDocument();
    expect(screen.getByText('goi-emoji-vui')).toBeInTheDocument();
  });

  it('mặc định gọi days=7; ?days=14 gọi days=14; đổi sang "30 ngày" ghi ?days=30 lên URL và gọi lại', async () => {
    const days = mockOverview((d) => makeOverview({ days: d }));
    const { router } = renderAt(<EconomyOverview />, `${URL_OVERVIEW}&days=14`);
    await screen.findByText('1.200');
    expect(days).toEqual([14]);

    await userEvent.click(screen.getByRole('button', { name: '30 ngày' }));
    await waitFor(() => expect(days).toContain(30));
    expect(urlParam(router, 'days')).toBe('30');

    // Về mặc định thì xoá khoá khỏi URL (URL sạch).
    await userEvent.click(screen.getByRole('button', { name: '7 ngày' }));
    await waitFor(() => expect(urlParam(router, 'days')).toBeNull());
  });

  it('?days=999 (URL bị sửa tay) rơi về mặc định 7 ngày', async () => {
    const days = mockOverview();
    renderAt(<EconomyOverview />, `${URL_OVERVIEW}&days=999`);
    await screen.findByText('1.200');
    expect(days).toEqual([7]);
  });
});

describe('EconomyOverview — dữ liệu rỗng và lỗi', () => {
  it('toàn số 0 → EmptyState "Chưa có dữ liệu" thay cho đường phẳng và bảng; đối soát chưa có báo cáo thì nói thẳng', async () => {
    mockOverview(() => makeEmptyOverview());
    renderAt(<EconomyOverview />, URL_OVERVIEW);

    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument();
    expect(screen.getByText(/Chưa có báo cáo nào còn hiệu lực/)).toBeInTheDocument();
    expect(screen.queryByText('Số liệu theo ngày')).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có ai sở hữu vật phẩm nào')).toBeInTheDocument();
  });

  it('tải lỗi → "Không tải được tổng quan" + Thử lại; thẻ hiện "—" chứ KHÔNG phải 0; thử lại thành công thì hiện số', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/economy/overview', () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_001', 'Lỗi máy chủ') : okBody(makeOverview());
      }),
    );
    renderAt(<EconomyOverview />, URL_OVERVIEW);

    expect(await screen.findByText('Không tải được tổng quan kinh tế xu')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText('Số liệu theo ngày')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('1.200')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được tổng quan kinh tế xu')).not.toBeInTheDocument();
  });

  it('403 (thiếu quyền) → EmptyState nói rõ, KHÔNG có nút Thử lại', async () => {
    server.use(http.get('*/admin/economy/overview', () => errorBody(403, 'AUTH_003', 'Không đủ quyền')));
    renderAt(<EconomyOverview />, URL_OVERVIEW);

    expect(await screen.findByText('Tài khoản của bạn chưa có quyền xem dữ liệu này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});

describe('EconomyOverview — đối soát', () => {
  it('đối soát khớp → thông báo thành công, không cảnh báo', async () => {
    mockOverview();
    renderAt(<EconomyOverview />, URL_OVERVIEW);
    expect(await screen.findByText(/320 ví đều khớp tổng sổ cái/)).toBeInTheDocument();
    expect(screen.queryByText('Đối soát phát hiện ví lệch sổ cái')).not.toBeInTheDocument();
  });

  it('có ví lệch → cảnh báo (KHÔNG tự sửa) kèm liên kết mở sổ cái từng ví', async () => {
    mockOverview(() =>
      makeOverview({
        reconcile: { at: '2026-09-27T02:30:00.000Z', checked: 320, mismatched: 2, sampleUserIds: [USER_ID, 'b1b2c3d4e5f6a1b2c3d4e5f6'] },
      }),
    );
    renderAt(<EconomyOverview />, URL_OVERVIEW);

    expect(await screen.findByText('Đối soát phát hiện ví lệch sổ cái')).toBeInTheDocument();
    expect(screen.getByText(/2\/320 ví có số dư khác tổng sổ cái/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /^Ví …/ });
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute('href')).toContain(`userId=${USER_ID}`);
    expect(links[0]!.getAttribute('href')).toContain('section=wallet');
  });
});
