/**
 * Tab `projects` (Dự án) của workspace (p3-02 admin.md §2.1, §4) — CHỈ số liệu + tên bảng, KHÔNG tiêu đề
 * thẻ, KHÔNG hành động ghi. Mock ở tầng HTTP (MSW).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceProjectsTab from '@/features/workspace/components/tabs/WorkspaceProjectsTab';

import { REVIEW_STATS } from '../peer-review/review-fixtures';
import { CONTRIBUTION_STATS, errorBody, okBody, PROJECT_STATS, renderWithQuery, signIn } from './p3-fixtures';

// Tab dự án còn gọi số đếm báo cáo đóng góp (p4-06) và số đếm chấm chéo (p4-05) — mặc định trả số hợp lệ; ca cần khác thì `server.use`.
const server = setupServer(
  http.get('*/admin/workspaces/:id/contribution-stats', () => okBody(CONTRIBUTION_STATS)),
  http.get('*/admin/workspaces/:id/review-stats', () => okBody(REVIEW_STATS)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['workspace:view']));

const renderTab = () => renderWithQuery(<WorkspaceProjectsTab workspaceId="ws-1" />);

/** Response "vi phạm hợp đồng": kèm tiêu đề/mô tả thẻ mà admin tuyệt đối không được thấy. */
const LEAKY_RESPONSE = {
  ...PROJECT_STATS,
  boards: PROJECT_STATS.boards.map((b) => ({
    ...b,
    tasks: [
      { id: 't-1', title: 'Sửa lỗi đăng nhập ở màn hình khách', description: 'Chi tiết nội bộ' },
      { id: 't-2', title: 'Chuẩn bị slide bảo vệ đồ án', assignee: 'Trần Thị Bình' },
    ],
    labels: [{ name: 'Khẩn cấp - khách hàng VIP' }],
  })),
  tasks: [{ id: 't-3', title: 'Thẻ quá hạn: nộp báo cáo tài chính' }],
};

describe('WorkspaceProjectsTab — số liệu', () => {
  it('hiện KPI, bảng các bảng công việc (kèm tên bảng) và biểu đồ theo tuần', async () => {
    server.use(http.get('*/admin/workspaces/:id/project-stats', () => okBody(PROJECT_STATS)));
    renderTab();

    expect(await screen.findByText('Tổng quan dự án')).toBeInTheDocument();
    // KPI: số bảng (đang dùng/đã lưu trữ), tổng thẻ, hoàn thành 30 ngày, quá hạn — mỗi thẻ là nhãn + giá trị.
    const kpi = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    expect(kpi('Số bảng')).toHaveTextContent('2');
    expect(kpi('Số bảng')).toHaveTextContent('1 đang dùng · 1 đã lưu trữ');
    expect(kpi('Tổng số thẻ')).toHaveTextContent('31');
    expect(kpi('Hoàn thành 30 ngày')).toHaveTextContent('14');
    expect(kpi('Thẻ quá hạn')).toHaveTextContent('4');

    // Bảng: tên bảng CÓ hiển thị (chốt admin.md), kèm mã rút gọn, số cột, số thẻ theo loại. Khối Chấm chéo (p4-05) đứng SAU và có
    // bảng riêng, nên lấy bảng ĐẦU TIÊN (bảng các bảng công việc).
    const table = screen.getAllByRole('table')[0];
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Đồ án cuối kỳ');
    expect(rows[0]).toHaveTextContent('#293a01');
    expect(rows[1]).toHaveTextContent('Sprint cũ');
    expect(rows[1]).toHaveTextContent('Đã lưu trữ');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Bảng',
      'Mã',
      'Số cột',
      'Cần làm',
      'Đang làm',
      'Chờ duyệt',
      'Hoàn thành',
      'Cập nhật',
    ]);

    expect(screen.getByText('Thẻ hoàn thành theo tuần')).toBeInTheDocument();
  });

  it('không có hành động ghi nào (bảng thuộc chủ nhóm)', async () => {
    signIn(['workspace:view', 'workspace:update', 'system-config:update']);
    server.use(http.get('*/admin/workspaces/:id/project-stats', () => okBody(PROJECT_STATS)));
    renderTab();
    await screen.findByText('Tổng quan dự án');
    // Cả khối báo cáo đóng góp và khối chấm chéo (tải sau tổng quan) cũng không có nút ghi nào.
    await screen.findByText('Báo cáo đóng góp');
    await screen.findByText('Chấm chéo');

    // Chỉ cho phép nút "Thử lại"-kiểu điều khiển hiển thị; ở trạng thái thành công không có nút nào.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('nhóm chưa có bảng: bảng rỗng có thông báo, biểu đồ rỗng có thông báo', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/project-stats', () =>
        okBody({
          boards: [],
          totals: { boards: 0, tasks: 0, done30d: 0, overdue: 0 },
          doneByWeek: [],
        }),
      ),
    );
    renderTab();

    expect(await screen.findByText('Nhóm chưa có bảng công việc nào')).toBeInTheDocument();
    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
  });

  it('cờ project tắt giữa chừng (404 CFG_005): "Dự án đang tắt", KHÔNG phải lỗi', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/project-stats', () =>
        errorBody(404, 'CFG_005', 'Tính năng chưa được bật'),
      ),
    );
    renderTab();

    expect(await screen.findByText('Dự án đang tắt')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được số liệu dự án')).not.toBeInTheDocument();
  });

  it('lỗi máy chủ: báo lỗi có "Thử lại", bấm là tải lại thành công', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/workspaces/:id/project-stats', () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_500', 'Lỗi hệ thống') : okBody(PROJECT_STATS);
      }),
    );
    renderTab();

    expect(await screen.findByText('Không tải được số liệu dự án')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Tổng quan dự án')).toBeInTheDocument();
  });

  it('workspace không còn (404 khác CFG_005) hoặc thiếu quyền (403): KHÔNG có "Thử lại"', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/project-stats', () =>
        errorBody(404, 'WORKSPACE_001', 'Không tìm thấy workspace'),
      ),
    );
    renderTab();

    expect(await screen.findByText('Không tải được số liệu dự án')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu này không còn tồn tại hoặc đã bị gỡ.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});

describe('WorkspaceProjectsTab — khối "Chấm chéo" (p4-05 admin.md §2.2)', () => {
  it('nhúng khối Chấm chéo sau khối Báo cáo đóng góp, gọi ?days=30', async () => {
    let days: string | null = null;
    server.use(
      http.get('*/admin/workspaces/:id/project-stats', () => okBody(PROJECT_STATS)),
      http.get('*/admin/workspaces/:id/review-stats', ({ request }) => {
        days = new URL(request.url).searchParams.get('days');
        return okBody(REVIEW_STATS);
      }),
    );
    renderTab();

    const review = await screen.findByText('Chấm chéo');
    const contribution = await screen.findByText('Báo cáo đóng góp');
    expect(days).toBe('30');
    // Thứ tự trong tab: Báo cáo đóng góp rồi Chấm chéo.
    expect(
      contribution.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // KPI của khối và bảng theo bảng (chỉ số đếm + tên bảng).
    expect(screen.getByText('Lượt chấm đang mở').parentElement).toHaveTextContent('4');
    expect(screen.getAllByRole('table')).toHaveLength(2);
  });

  it('số đếm chấm chéo lỗi 500: chỉ khối này báo lỗi + "Thử lại", số liệu dự án vẫn hiện; bấm là tải lại thành công', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/workspaces/:id/project-stats', () => okBody(PROJECT_STATS)),
      http.get('*/admin/workspaces/:id/review-stats', () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_500', 'Lỗi hệ thống') : okBody(REVIEW_STATS);
      }),
    );
    renderTab();

    expect(await screen.findByText('Không tải được số liệu chấm chéo')).toBeInTheDocument();
    expect(screen.getByText('Tổng quan dự án')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chấm chéo')).toBeInTheDocument();
  });

  it('cờ project tắt giữa chừng (404 CFG_005 ở project-stats): KHÔNG gọi số đếm chấm chéo', async () => {
    let reviewCalls = 0;
    server.use(
      http.get('*/admin/workspaces/:id/project-stats', () =>
        errorBody(404, 'CFG_005', 'Tính năng chưa được bật'),
      ),
      http.get('*/admin/workspaces/:id/review-stats', () => {
        reviewCalls += 1;
        return okBody(REVIEW_STATS);
      }),
    );
    renderTab();

    expect(await screen.findByText('Dự án đang tắt')).toBeInTheDocument();
    expect(screen.queryByText('Chấm chéo')).not.toBeInTheDocument();
    expect(reviewCalls).toBe(0);
  });
});

describe('tab projects — DOM không lộ tiêu đề thẻ (cổng ra Phase 3 mục 5)', () => {
  const LEAKED = [
    'Sửa lỗi đăng nhập',
    'Chi tiết nội bộ',
    'Chuẩn bị slide bảo vệ',
    'Trần Thị Bình',
    'Khẩn cấp - khách hàng VIP',
    'nộp báo cáo tài chính',
  ];

  it('BE lỡ trả thừa tiêu đề/mô tả/người làm/nhãn ⇒ không chữ nào lên màn hình', async () => {
    server.use(http.get('*/admin/workspaces/:id/project-stats', () => okBody(LEAKY_RESPONSE)));
    renderTab();
    await screen.findByText('Tổng quan dự án');

    const text = document.body.textContent ?? '';
    for (const leaked of LEAKED) {
      expect(text, `không được in "${leaked}"`).not.toContain(leaked);
    }
    // Tên bảng vẫn hiện (metadata tổ chức).
    expect(text).toContain('Đồ án cuối kỳ');
  });
});

// Đọc mã nguồn ở dạng chuỗi (không dùng `fs`: tsconfig.app không nạp type của Node).
const SOURCES = import.meta.glob('../../../src/features/workspace/**/*[Pp]roject*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const entries = Object.entries(SOURCES).map(([path, raw]) => [path, stripComments(raw)] as const);
const inFile = (suffix: string) => entries.filter(([path]) => path.endsWith(suffix));

describe('tab projects — mã nguồn không chạm nội dung thẻ', () => {
  it('quét được đủ các file dự án (không quét rỗng)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(9);
  });

  it('kiểu dữ liệu không khai trường tiêu đề/mô tả/người làm/nhãn/bình luận của thẻ', () => {
    const types = inFile('workspace-projects.types.ts');
    expect(types).toHaveLength(1);
    // Khai báo thuộc tính (`title: string`, `labels?: …`) — KHÔNG quét prop JSX `title="…"` của kit2.
    const forbidden =
      /\b(title|description|assignee\w*|labels?|comments?|checklist\w*|dueDate|body|content)\s*[?:]/;
    expect(forbidden.exec(types[0][1])?.[0]).toBeUndefined();
  });

  it('không file nào đọc `.title` / `.description` / `.assignees` / `.labels` / `.comments` của dữ liệu', () => {
    const access = /\.(title|description|assignee\w*|labels?|comments?|checklist\w*|dueDate)\b/;
    const offenders = entries.filter(([, code]) => access.test(code)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('"tasks" chỉ là SỐ ĐẾM (`totals.tasks: number`), không có danh sách thẻ nào trong kiểu', () => {
    const types = inFile('workspace-projects.types.ts')[0][1];
    expect(types).toMatch(/\btasks:\s*number\b/);
    expect(types).not.toMatch(/\bTask\w*\s*(\[\]|>)/);
    expect(types).not.toMatch(/\btasks:\s*\w+\[\]/);
  });

  it('service chỉ đọc (GET), không có lệnh ghi', () => {
    const service = inFile('workspace-projects.service.ts');
    expect(service).toHaveLength(1);
    expect(service[0][1]).toMatch(/apiClient\.get\b/);
    expect(service[0][1]).not.toMatch(/apiClient\.(post|put|patch|delete)\b/);
  });
});
