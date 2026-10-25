/**
 * Tab "Cố vấn" của workspace (p6-03 admin.md §2.2, §4): bài tìm cố vấn + đợt cố vấn của nhóm; "Kết thúc cấp nền tảng" chỉ với đợt ACTIVE VÀ có
 * `workspace:update`, bắt buộc lý do ≥ 10 ký tự rồi POST `{ reason }`; KHÔNG lời nhắn ứng tuyển. Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceMentorTab from '@/features/workspace/components/tabs/WorkspaceMentorTab';

import { makeEngagement, MENTOR_OVERVIEW } from './integrations-mentor-fixtures';
import { errorBody, okBody, renderWithQuery, signIn } from './p3-fixtures';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['workspace:view']));

const OVERVIEW_URL = '*/admin/workspaces/:id/mentor';
const END_URL = '*/admin/mentor/engagements/:id/end';
const ENGAGEMENT_ID = '650000000000000000000b01';
const renderTab = () => renderWithQuery(<WorkspaceMentorTab workspaceId="ws-1" />);

/** Hai bảng cùng trang, theo thứ tự: đợt cố vấn rồi bài tìm cố vấn (đợt là việc cần xử lý nên đứng trước). */
const tableUnder = (title: 'Đợt cố vấn' | 'Bài tìm cố vấn') =>
  screen.getAllByRole('table')[title === 'Đợt cố vấn' ? 0 : 1] as HTMLElement;

describe('WorkspaceMentorTab — dữ liệu', () => {
  it('hiện đợt cố vấn (cố vấn, bài, trạng thái, lý do kết thúc) và bài tìm cố vấn (trạng thái, cố vấn/cần, số đơn + chờ, báo cáo, nhãn "Đã ẩn")', async () => {
    let path = '';
    server.use(
      http.get(OVERVIEW_URL, ({ request }) => {
        path = new URL(request.url).pathname;
        return okBody(MENTOR_OVERVIEW);
      }),
    );
    renderTab();

    expect(await screen.findByText('Trần Cố Vấn')).toBeInTheDocument();
    expect(path).toMatch(/\/admin\/workspaces\/ws-1\/mentor$/);

    const engagementRows = within(tableUnder('Đợt cố vấn')).getAllByRole('row').slice(1);
    expect(engagementRows).toHaveLength(2);
    expect(engagementRows[0]).toHaveTextContent('Trần Cố Vấn');
    expect(engagementRows[0]).toHaveTextContent('Cần cố vấn Kiến trúc phần mềm');
    expect(engagementRows[0]).toHaveTextContent('Đang hoạt động');
    expect(engagementRows[1]).toHaveTextContent('Lê Đã Nghỉ');
    expect(engagementRows[1]).toHaveTextContent('Đã kết thúc');
    expect(engagementRows[1]).toHaveTextContent('Quản trị nền tảng kết thúc');

    const postRows = within(tableUnder('Bài tìm cố vấn')).getAllByRole('row').slice(1);
    expect(postRows).toHaveLength(2);
    expect(postRows[0]).toHaveTextContent('Cần cố vấn Kiến trúc phần mềm');
    expect(postRows[0]).toHaveTextContent('Đang nhận đơn');
    expect(postRows[0]).toHaveTextContent('1 / 2');
    expect(postRows[0]).toHaveTextContent('5 · 2 chờ');
    expect(postRows[0]).not.toHaveTextContent('Đã ẩn');
    expect(postRows[1]).toHaveTextContent('Cố vấn UX cho đồ án');
    expect(postRows[1]).toHaveTextContent('Đã đóng');
    expect(postRows[1]).toHaveTextContent('Đã ẩn');
    expect(postRows[1]).toHaveTextContent('3');
  });

  it('nhóm chưa có gì: cả hai bảng rỗng có thông báo (không phải lỗi)', async () => {
    server.use(http.get(OVERVIEW_URL, () => okBody({ posts: [], engagements: [] })));
    renderTab();

    expect(await screen.findByText('Nhóm chưa có đợt cố vấn nào')).toBeInTheDocument();
    expect(screen.getByText('Nhóm chưa đăng bài tìm cố vấn nào')).toBeInTheDocument();
  });
});

describe('WorkspaceMentorTab — Kết thúc cấp nền tảng', () => {
  it('thiếu workspace:update ⇒ không có nút và không có cột hành động', async () => {
    server.use(http.get(OVERVIEW_URL, () => okBody(MENTOR_OVERVIEW)));
    renderTab();
    await screen.findByText('Trần Cố Vấn');

    expect(screen.queryByRole('button', { name: 'Kết thúc cấp nền tảng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Hành động' })).not.toBeInTheDocument();
  });

  it('có workspace:update ⇒ nút CHỈ ở đợt ACTIVE (đợt đã kết thúc không có)', async () => {
    signIn(['workspace:view', 'workspace:update']);
    server.use(http.get(OVERVIEW_URL, () => okBody(MENTOR_OVERVIEW)));
    renderTab();
    await screen.findByText('Trần Cố Vấn');

    expect(screen.getAllByRole('button', { name: 'Kết thúc cấp nền tảng' })).toHaveLength(1);
    const rows = within(tableUnder('Đợt cố vấn')).getAllByRole('row').slice(1);
    expect(
      within(rows[0]).getByRole('button', { name: 'Kết thúc cấp nền tảng' }),
    ).toBeInTheDocument();
    expect(within(rows[1]).queryByRole('button')).not.toBeInTheDocument();
  });

  it('lý do < 10 ký tự không gửi; đủ lý do → POST { reason } tới đúng đợt rồi tải lại (đợt chuyển sang đã kết thúc)', async () => {
    signIn(['workspace:view', 'workspace:update']);
    let overviewCalls = 0;
    let posted: unknown = null;
    let postedId = '';
    server.use(
      http.get(OVERVIEW_URL, () => {
        overviewCalls += 1;
        return okBody(
          overviewCalls === 1
            ? MENTOR_OVERVIEW
            : {
                ...MENTOR_OVERVIEW,
                engagements: [
                  makeEngagement({
                    status: 'ENDED',
                    endedAt: '2026-09-25T02:00:00.000Z',
                    endedReason: 'ENDED_BY_PLATFORM',
                  }),
                ],
              },
        );
      }),
      http.post(END_URL, async ({ request, params }) => {
        posted = await request.json();
        postedId = String(params.id);
        return okBody(makeEngagement({ status: 'ENDED', endedReason: 'ENDED_BY_PLATFORM' }));
      }),
    );
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Kết thúc cấp nền tảng' }));

    expect(screen.getByText('Kết thúc cấp nền tảng — Trần Cố Vấn')).toBeInTheDocument();
    const reason = screen.getByLabelText(/Lý do/);
    await user.type(reason, 'quá ngắn');
    await user.click(screen.getByRole('button', { name: 'Kết thúc đợt' }));
    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(posted).toBeNull();

    await user.clear(reason);
    await user.type(reason, 'Cố vấn vi phạm quy tắc nhóm nhiều lần');
    await user.click(screen.getByRole('button', { name: 'Kết thúc đợt' }));

    await waitFor(() =>
      expect(posted).toEqual({ reason: 'Cố vấn vi phạm quy tắc nhóm nhiều lần' }),
    );
    expect(postedId).toBe(ENGAGEMENT_ID);
    await waitFor(() => expect(overviewCalls).toBeGreaterThanOrEqual(2));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Kết thúc cấp nền tảng' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('BE trả MENTOR_009 (đợt vừa kết thúc): modal giữ mở, danh sách được tải lại', async () => {
    signIn(['workspace:view', 'workspace:update']);
    let overviewCalls = 0;
    server.use(
      http.get(OVERVIEW_URL, () => {
        overviewCalls += 1;
        return okBody(MENTOR_OVERVIEW);
      }),
      http.post(END_URL, () => errorBody(409, 'MENTOR_009', 'Đợt cố vấn đã kết thúc')),
    );
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Kết thúc cấp nền tảng' }));
    await user.type(screen.getByLabelText(/Lý do/), 'Cố vấn vi phạm quy tắc nhóm nhiều lần');
    await user.click(screen.getByRole('button', { name: 'Kết thúc đợt' }));

    await waitFor(() => expect(overviewCalls).toBeGreaterThanOrEqual(2));
    expect(screen.getByLabelText(/Lý do/)).toBeInTheDocument();
  });
});

describe('WorkspaceMentorTab — riêng tư', () => {
  const LEAKED = [
    'Em rất muốn được học hỏi từ anh',
    'https://portfolio.example/ung-vien',
    'Ứng Viên Bí Mật',
    'Không đủ kinh nghiệm',
  ];

  it('BE lỡ trả thừa lời nhắn ứng tuyển, portfolio, người ứng tuyển, lý do từ chối ⇒ không chữ nào lên màn hình', async () => {
    server.use(
      http.get(OVERVIEW_URL, () =>
        okBody({
          posts: MENTOR_OVERVIEW.posts.map((p) => ({
            ...p,
            applications: [
              {
                message: 'Em rất muốn được học hỏi từ anh',
                portfolioUrl: 'https://portfolio.example/ung-vien',
                applicant: { name: 'Ứng Viên Bí Mật' },
                rejectReason: 'Không đủ kinh nghiệm',
              },
            ],
          })),
          engagements: MENTOR_OVERVIEW.engagements,
        }),
      ),
    );
    renderTab();
    await screen.findByText('Trần Cố Vấn');

    const text = document.body.textContent ?? '';
    for (const leaked of LEAKED) {
      expect(text, `không được in "${leaked}"`).not.toContain(leaked);
    }
  });
});

describe('WorkspaceMentorTab — lỗi tải', () => {
  it('lỗi máy chủ: báo lỗi có "Thử lại" (KHÔNG vẽ bảng rỗng), bấm là tải lại thành công', async () => {
    let calls = 0;
    server.use(
      http.get(OVERVIEW_URL, () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_500', 'Lỗi hệ thống') : okBody(MENTOR_OVERVIEW);
      }),
    );
    renderTab();

    expect(await screen.findByText('Không tải được dữ liệu cố vấn')).toBeInTheDocument();
    expect(screen.queryByText('Nhóm chưa có đợt cố vấn nào')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Trần Cố Vấn')).toBeInTheDocument();
  });

  it('403/404 khác CFG_005: giải thích, KHÔNG có "Thử lại"', async () => {
    server.use(
      http.get(OVERVIEW_URL, () => errorBody(404, 'WORKSPACE_001', 'Không tìm thấy nhóm')),
    );
    renderTab();

    expect(await screen.findByText('Không tải được dữ liệu cố vấn')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu này không còn tồn tại hoặc đã bị gỡ.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('cờ mentor tắt giữa chừng (404 CFG_005): "Cố vấn đang tắt", KHÔNG phải lỗi', async () => {
    server.use(http.get(OVERVIEW_URL, () => errorBody(404, 'CFG_005', 'Tính năng chưa được bật')));
    renderTab();

    expect(await screen.findByText('Cố vấn đang tắt')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được dữ liệu cố vấn')).not.toBeInTheDocument();
  });
});

// Đọc mã nguồn ở dạng chuỗi (không dùng `fs`: tsconfig.app không nạp type của Node).
const SOURCES = import.meta.glob('../../../src/features/workspace/**/*[Mm]entor*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const entries = Object.entries(SOURCES).map(([path, raw]) => [path, stripComments(raw)] as const);
const inFile = (suffix: string) => entries.filter(([path]) => path.endsWith(suffix));

describe('tab cố vấn — mã nguồn không chạm lời nhắn ứng tuyển', () => {
  it('quét được đủ các file cố vấn (không quét rỗng)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(7);
  });

  it('kiểu dữ liệu không khai lời nhắn, portfolio, người ứng tuyển, lý do từ chối', () => {
    const types = inFile('workspace-mentor.types.ts');
    expect(types).toHaveLength(1);
    const forbidden = /\b(message|portfolioUrl|applicants?|rejectReason|applications?)\s*[?:]/;
    expect(forbidden.exec(types[0][1])?.[0]).toBeUndefined();
  });

  it('không file nào đọc `.message` / `.portfolioUrl` / `.applicant` / `.rejectReason` của dữ liệu', () => {
    const access = /\.(message|portfolioUrl|applicants?|rejectReason|applications?)\b/;
    const offenders = entries.filter(([, code]) => access.test(code)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('service chỉ có GET tổng quan và một POST kết thúc đợt', () => {
    const service = inFile('workspace-mentor.service.ts');
    expect(service).toHaveLength(1);
    expect(service[0][1].match(/apiClient\.get\b/g)).toHaveLength(1);
    expect(service[0][1].match(/apiClient\.post\b/g)).toHaveLength(1);
    expect(service[0][1]).not.toMatch(/apiClient\.(put|patch|delete)\b/);
  });
});
