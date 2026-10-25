/**
 * Khối "Báo cáo đóng góp" trong tab "Dự án" của workspace (p4-06 admin.md §2.2, §4) — CHỈ số đếm về sức khoẻ tính
 * năng, KHÔNG điểm/tỷ lệ/heatmap/thẻ của thành viên, KHÔNG hành động ghi. Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceContributionStats from '@/features/workspace/components/tabs/WorkspaceContributionStats';

import { CONTRIBUTION_STATS, errorBody, okBody, renderWithRouter, signIn } from './p3-fixtures';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['workspace:view']));

const URL_PATTERN = '*/admin/workspaces/:id/contribution-stats';
const renderBlock = () => renderWithRouter(<WorkspaceContributionStats workspaceId="ws-1" />);
/** Thẻ số liệu là nhãn + giá trị cùng một khối — lấy khối theo nhãn. */
const kpi = (label: string) => screen.getByText(label).parentElement as HTMLElement;

/** Response "vi phạm hợp đồng": kèm điểm, phần trăm, danh sách thành viên, heatmap và thẻ mà admin tuyệt đối không được thấy. */
const LEAKY_RESPONSE = {
  ...CONTRIBUTION_STATS,
  members: [{ user: { name: 'Nguyễn Văn Thừa' }, score: 91.5, share: 58.7, tasksDone: 4123 }],
  score: 77.7,
  share: 12.3,
  heatmap: { days: [{ date: '2026-09-01', total: 9137 }] },
  tasks: [{ title: 'Thẻ bí mật của nhóm' }],
};

describe('WorkspaceContributionStats — số liệu', () => {
  it('hiện 5 số đếm: bảng tuỳ chỉnh, PDF đã xuất/lỗi (30 ngày), lần tính lại gần nhất, bảng chờ tính lại', async () => {
    let days: string | null = null;
    server.use(
      http.get(URL_PATTERN, ({ request }) => {
        days = new URL(request.url).searchParams.get('days');
        return okBody(CONTRIBUTION_STATS);
      }),
    );
    renderBlock();

    expect(await screen.findByText('Báo cáo đóng góp')).toBeInTheDocument();
    expect(kpi('Bảng dùng trọng số tuỳ chỉnh')).toHaveTextContent('3');
    expect(kpi('Báo cáo PDF đã xuất (30 ngày)')).toHaveTextContent('12');
    expect(kpi('Xuất PDF lỗi (30 ngày)')).toHaveTextContent('1');
    expect(kpi('Lần tính lại gần nhất')).toHaveTextContent(/\d{2}:\d{2} 25\/09\/2026/);
    expect(kpi('Bảng đang chờ tính lại')).toHaveTextContent('2');
    expect(days).toBe('30');
  });

  it('chưa bảng nào được tính ⇒ "Chưa tính lần nào" (không hiện ngày giả)', async () => {
    server.use(
      http.get(URL_PATTERN, () => okBody({ ...CONTRIBUTION_STATS, lastComputedAt: null })),
    );
    renderBlock();

    await screen.findByText('Báo cáo đóng góp');
    expect(kpi('Lần tính lại gần nhất')).toHaveTextContent('Chưa tính lần nào');
  });

  it('fixture thừa members, score, share, heatmap, tasks ⇒ KHÔNG xuất hiện trong DOM', async () => {
    server.use(http.get(URL_PATTERN, () => okBody(LEAKY_RESPONSE)));
    renderBlock();

    await screen.findByText('Báo cáo đóng góp');
    const text = document.body.textContent ?? '';
    for (const leaked of [
      'Nguyễn Văn Thừa',
      '91,5',
      '91.5',
      '58,7',
      '58.7',
      '77,7',
      '77.7',
      '12,3',
      '4123',
      '4.123',
      '9137',
      '9.137',
      'Thẻ bí mật',
    ]) {
      expect(text, `lộ "${leaked}"`).not.toContain(leaked);
    }
  });

  it('không có hành động ghi nào (bảng thuộc chủ nhóm)', async () => {
    signIn(['workspace:view', 'workspace:update', 'system-config:update']);
    server.use(http.get(URL_PATTERN, () => okBody(CONTRIBUTION_STATS)));
    renderBlock();

    await screen.findByText('Báo cáo đóng góp');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('xuất lỗi > 0 chỉ đổi màu thẻ, không sinh cảnh báo (cảnh báo chỉ dành cho bảng chờ tính lại quá 1 giờ)', async () => {
    server.use(http.get(URL_PATTERN, () => okBody(CONTRIBUTION_STATS)));
    renderBlock();

    await screen.findByText('Báo cáo đóng góp');
    expect(screen.queryByText(/chờ tính lại quá 1 giờ/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('WorkspaceContributionStats — cảnh báo bảng chờ tính lại', () => {
  const STALE = { ...CONTRIBUTION_STATS, staleBoards: 2, pendingBoards: 3 };

  it('có bảng chờ > 1 giờ + có system-config:view ⇒ Callout kèm liên kết tới trang Jobs', async () => {
    signIn(['workspace:view', 'system-config:view']);
    server.use(http.get(URL_PATTERN, () => okBody(STALE)));
    renderBlock();

    expect(await screen.findByText('2 bảng chờ tính lại quá 1 giờ')).toBeInTheDocument();
    expect(
      screen.getByText('Kiểm tra job contribution.recompute ở trang Jobs.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở trang Jobs' })).toHaveAttribute(
      'href',
      '/system-config?tab=jobs&sub=failed',
    );
    expect(kpi('Bảng đang chờ tính lại')).toHaveTextContent('3');
  });

  it('thiếu system-config:view ⇒ vẫn có cảnh báo nhưng KHÔNG có liên kết Jobs', async () => {
    signIn(['workspace:view']);
    server.use(http.get(URL_PATTERN, () => okBody(STALE)));
    renderBlock();

    expect(await screen.findByText('2 bảng chờ tính lại quá 1 giờ')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mở trang Jobs' })).not.toBeInTheDocument();
  });
});

describe('WorkspaceContributionStats — trạng thái tải', () => {
  it('cờ project tắt giữa chừng (404 CFG_005) ⇒ khối ẩn, KHÔNG báo lỗi (tab cha đã báo "Dự án đang tắt")', async () => {
    let called = false;
    server.use(
      http.get(URL_PATTERN, () => {
        called = true;
        return errorBody(404, 'CFG_005', 'Tính năng chưa được bật');
      }),
    );
    renderBlock();

    await waitFor(() => expect(called).toBe(true));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByText('Báo cáo đóng góp')).not.toBeInTheDocument();
    expect(screen.queryByText('Không tải được số liệu báo cáo đóng góp')).not.toBeInTheDocument();
  });

  it('lỗi máy chủ ⇒ báo lỗi có "Thử lại", bấm là tải lại thành công; không hiện số 0 giả', async () => {
    let calls = 0;
    server.use(
      http.get(URL_PATTERN, () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_500', 'Lỗi hệ thống') : okBody(CONTRIBUTION_STATS);
      }),
    );
    renderBlock();

    expect(await screen.findByText('Không tải được số liệu báo cáo đóng góp')).toBeInTheDocument();
    expect(screen.queryByText('Bảng dùng trọng số tuỳ chỉnh')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Báo cáo đóng góp')).toBeInTheDocument();
  });

  it('thiếu quyền (403) ⇒ giải thích, KHÔNG có "Thử lại"', async () => {
    server.use(http.get(URL_PATTERN, () => errorBody(403, 'AUTH_005', 'Không đủ quyền')));
    renderBlock();

    expect(await screen.findByText('Không tải được số liệu báo cáo đóng góp')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản của bạn không có quyền xem mục này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});

describe('kiểu dữ liệu — không có trường về thành viên', () => {
  it('workspace-contribution.types.ts chỉ khai số đếm (quét theo từ khoá nhạy cảm, bỏ chú thích)', () => {
    const sources = import.meta.glob(
      '../../../src/features/workspace/types/workspace-contribution.types.ts',
      {
        eager: true,
        query: '?raw',
        import: 'default',
      },
    ) as Record<string, string>;
    const raw = Object.values(sources)[0];
    expect(raw, 'không đọc được file kiểu').toBeTruthy();

    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(
      /\b(members?|users?|scores?|share|heatmap|tasks?|title|name|email|assignee|points?)\b/i,
    );
    expect(code).toMatch(/boardsWithCustomWeights/);
    expect(code).toMatch(/staleBoards/);
  });
});
