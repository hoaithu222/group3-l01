/**
 * Tab "Thi đấu trực tiếp" (p5-01 admin.md §2.1, §4): bảng phiên render đủ cột, bộ lọc trạng thái + trang sống trên URL và đi thẳng vào request,
 * lỗi tải có "Thử lại" (không vẽ bảng rỗng nói dối). BE chỉ lọc một trạng thái nên KHÔNG có ô ngày/workspace/host. Mock tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import LiveQuizOpsTab from '@/features/live-quiz-ops/components/LiveQuizOpsTab';

import {
  errorBody,
  HOST_ID,
  makeSession,
  okBody,
  pageMeta,
  renderAt,
  SESSION_ID,
  signIn,
  urlParam,
  WORKSPACE_ID,
} from './live-quiz-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['gamification:view']));

const LIST = '*/admin/live-quiz/sessions';

function mockList(items = [makeSession()]) {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get(LIST, ({ request }) => {
      calls.push(new URL(request.url).searchParams);
      return okBody(items, pageMeta(items.length));
    }),
  );
  return calls;
}

describe('LiveQuizOpsTab — bảng phiên', () => {
  it('render các cột: bộ câu hỏi, trạng thái (chữ), người chơi n / 100, câu, lý do kết thúc; mặc định không lọc trạng thái, limit 20', async () => {
    const calls = mockList([
      makeSession(),
      makeSession({
        id: '650000000000000000000a02',
        status: 'CANCELLED',
        endReason: 'ADMIN_ENDED',
        setTitle: 'Từ vựng IELTS',
        workspaceId: null,
        playersCount: 5,
        currentIndex: 4,
        total: 12,
        endedAt: '2026-09-25T03:00:00.000Z',
      }),
    ]);
    renderAt(<LiveQuizOpsTab />, '/gamification?tab=live-quiz');

    await screen.findByText('Từ vựng IELTS');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Ôn tập Giải tích 1');
    expect(rows[0]).toHaveTextContent('Đang diễn ra');
    expect(rows[0]).toHaveTextContent('24 / 100');
    expect(rows[0]).toHaveTextContent('3 / 10');
    expect(rows[1]).toHaveTextContent('Đã huỷ');
    expect(rows[1]).toHaveTextContent('Quản trị nền tảng kết thúc');
    expect(rows[1]).toHaveTextContent('5 / 100');
    expect(rows[1]).toHaveTextContent('5 / 12');
    // Bảng chỉ hiện mã rút gọn của người tổ chức/workspace (BE chưa trả tên).
    expect(rows[0]).toHaveTextContent(`#${HOST_ID.slice(-6)}`);
    expect(rows[0]).toHaveTextContent(`#${WORKSPACE_ID.slice(-6)}`);

    expect(calls[0]!.get('status')).toBeNull();
    expect(calls[0]!.get('limit')).toBe('20');
    expect(calls[0]!.get('page')).toBe('1');
    // Cột PIN không tồn tại.
    expect(screen.queryByRole('columnheader', { name: /PIN/i })).not.toBeInTheDocument();
  });

  it('mã người tổ chức/workspace là liên kết khi có user:view / workspace:view, thiếu quyền thì chữ thường', async () => {
    signIn(['gamification:view', 'user:view', 'workspace:view']);
    mockList();
    const first = renderAt(<LiveQuizOpsTab />, '/gamification?tab=live-quiz');
    const host = await screen.findByRole('link', { name: `#${HOST_ID.slice(-6)}` });
    expect(host).toHaveAttribute('href', `/user/${HOST_ID}`);
    expect(screen.getByRole('link', { name: `#${WORKSPACE_ID.slice(-6)}` })).toHaveAttribute(
      'href',
      `/workspace/${WORKSPACE_ID}`,
    );
    first.unmount();

    signIn(['gamification:view']);
    renderAt(<LiveQuizOpsTab />, '/gamification?tab=live-quiz');
    expect(await screen.findByText(`#${HOST_ID.slice(-6)}`)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: `#${HOST_ID.slice(-6)}` })).not.toBeInTheDocument();
  });

  it('trạng thái + trang trên URL đi vào request; giá trị lạ bị bỏ', async () => {
    const calls = mockList();
    const first = renderAt(
      <LiveQuizOpsTab />,
      '/gamification?tab=live-quiz&status=IN_PROGRESS&page=2',
    );
    await screen.findByText('Ôn tập Giải tích 1');
    expect(calls[0]!.get('status')).toBe('IN_PROGRESS');
    expect(calls[0]!.get('page')).toBe('2');
    first.unmount();

    const bad = mockList();
    renderAt(<LiveQuizOpsTab />, '/gamification?tab=live-quiz&status=EVIL');
    await waitFor(() => expect(bad.length).toBeGreaterThan(0));
    expect(bad[0]!.get('status')).toBeNull();
  });

  it('chọn trạng thái ghi lên URL và về trang 1; "Xoá bộ lọc" bỏ trạng thái', async () => {
    const calls = mockList();
    const { router } = renderAt(<LiveQuizOpsTab />, '/gamification?tab=live-quiz&page=3');
    await screen.findByText('Ôn tập Giải tích 1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái phiên' }));
    await user.click(await screen.findByRole('option', { name: 'Đã kết thúc' }));

    await waitFor(() => expect(urlParam(router, 'status')).toBe('FINISHED'));
    expect(urlParam(router, 'page')).toBeNull();
    expect(urlParam(router, 'tab')).toBe('live-quiz');
    await waitFor(() => expect(calls.at(-1)!.get('status')).toBe('FINISHED'));

    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    await waitFor(() => expect(urlParam(router, 'status')).toBeNull());
  });

  it('bấm thời gian bắt đầu mở ngăn kéo qua ?sessionId= (giữ bộ lọc)', async () => {
    server.use(
      http.get(`*/admin/live-quiz/sessions/${SESSION_ID}`, () =>
        okBody({ ...makeSession(), results: [] }),
      ),
    );
    mockList();
    const { router } = renderAt(
      <LiveQuizOpsTab />,
      '/gamification?tab=live-quiz&status=IN_PROGRESS',
    );
    await screen.findByText('Ôn tập Giải tích 1');
    const row = screen.getAllByRole('row')[1]!;
    await userEvent.setup().click(within(row).getAllByRole('link')[0]!);
    await waitFor(() => expect(urlParam(router, 'sessionId')).toBe(SESSION_ID));
    expect(urlParam(router, 'status')).toBe('IN_PROGRESS');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('không có phiên nào: thông báo rỗng theo bộ lọc', async () => {
    mockList([]);
    renderAt(<LiveQuizOpsTab />, '/gamification?tab=live-quiz&status=WAITING');
    expect(await screen.findByText('Không có phiên nào ở trạng thái này')).toBeInTheDocument();
  });
});

describe('LiveQuizOpsTab — lỗi tải', () => {
  it('BE lỗi: hiện lỗi + "Thử lại" (KHÔNG vẽ bảng rỗng); bấm là tải lại thành công', async () => {
    let calls = 0;
    server.use(
      http.get(LIST, () => {
        calls += 1;
        return calls === 1
          ? errorBody(500, 'SYS_500', 'Lỗi hệ thống')
          : okBody([makeSession()], pageMeta(1));
      }),
    );
    renderAt(<LiveQuizOpsTab />, '/gamification?tab=live-quiz');

    expect(await screen.findByText('Không tải được danh sách phiên Live Quiz')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có phiên Live Quiz nào')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Ôn tập Giải tích 1')).toBeInTheDocument();
  });
});
