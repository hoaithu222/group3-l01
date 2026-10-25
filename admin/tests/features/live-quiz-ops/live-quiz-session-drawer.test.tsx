/**
 * Ngăn kéo phiên Live Quiz (p5-01 admin.md §2.2, §4): tổng quan + bảng kết quả bền; "Kết thúc khẩn cấp" chỉ khi có `gamification:update` VÀ phiên còn
 * mở, bắt buộc lý do ≥ 10 ký tự rồi POST `{ reason }`; 404/lỗi tạm thời tách bạch. Không PIN/nội dung câu hỏi/đáp án từng người. Mock tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import LiveQuizSessionDrawer from '@/features/live-quiz-ops/components/LiveQuizSessionDrawer';

import {
  errorBody,
  makeDetail,
  okBody,
  renderAt,
  RESULT_ROWS,
  SESSION_ID,
  signIn,
} from './live-quiz-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['gamification:view']));

const DETAIL_URL = `*/admin/live-quiz/sessions/${SESSION_ID}`;
const END_URL = `*/admin/live-quiz/sessions/${SESSION_ID}/end`;

const mockDetail = (detail = makeDetail()) =>
  server.use(http.get(DETAIL_URL, () => okBody(detail)));
const renderDrawer = () =>
  renderAt(<LiveQuizSessionDrawer sessionId={SESSION_ID} onClose={() => {}} />, '/');

describe('LiveQuizSessionDrawer — tổng quan và kết quả', () => {
  it('phiên đã kết thúc: metadata + bảng kết quả (hạng, biệt danh, điểm, đúng/đã trả lời), KHÔNG hiện id người chơi', async () => {
    mockDetail(
      makeDetail({
        status: 'FINISHED',
        endReason: 'COMPLETED',
        currentIndex: 9,
        endedAt: '2026-09-25T03:00:00.000Z',
        resultsPersistedAt: '2026-09-25T03:01:00.000Z',
        results: RESULT_ROWS,
      }),
    );
    renderDrawer();

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Ôn tập Giải tích 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Đã kết thúc')).toBeInTheDocument();
    expect(within(dialog).getByText('Đã hết câu hỏi')).toBeInTheDocument();
    expect(within(dialog).getByText('24 / 100')).toBeInTheDocument();
    expect(within(dialog).getByText('10 / 10')).toBeInTheDocument();

    const rows = within(dialog).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Cú đêm');
    expect(rows[0]).toHaveTextContent('8.200');
    expect(rows[0]).toHaveTextContent('9 / 10');
    expect(rows[1]).toHaveTextContent('Ẩn danh');
    for (const r of RESULT_ROWS) expect(dialog.textContent).not.toContain(r.userId);
  });

  it('chưa có kết quả: giải thích theo trạng thái (đang diễn ra / đã huỷ / đang tổng hợp)', async () => {
    mockDetail(makeDetail());
    const first = renderDrawer();
    expect(
      await screen.findByText('Phiên chưa kết thúc nên chưa có bảng kết quả.'),
    ).toBeInTheDocument();
    first.unmount();

    mockDetail(makeDetail({ status: 'CANCELLED', endReason: 'ADMIN_ENDED' }));
    const second = renderDrawer();
    expect(await screen.findByText('Phiên đã huỷ nên không lưu bảng kết quả.')).toBeInTheDocument();
    second.unmount();

    mockDetail(makeDetail({ status: 'FINISHED', endReason: 'COMPLETED' }));
    renderDrawer();
    expect(
      await screen.findByText('Kết quả đang được tổng hợp, sẽ hiện sau ít phút.'),
    ).toBeInTheDocument();
  });

  it('BE lỡ trả thừa PIN, câu hỏi, đáp án từng người ⇒ không chữ nào lên màn hình', async () => {
    mockDetail({
      ...makeDetail({ status: 'FINISHED', results: RESULT_ROWS }),
      pin: '482913',
      questions: [{ prompt: 'Đạo hàm của sin x là gì?', options: ['cos x', '-cos x'] }],
      results: RESULT_ROWS.map((r) => ({
        ...r,
        answers: [{ index: 0, choice: 2, correct: false, points: 0 }],
      })),
    } as unknown as ReturnType<typeof makeDetail>);
    renderDrawer();
    await screen.findByText('Cú đêm');

    const text = document.body.textContent ?? '';
    for (const leaked of ['482913', 'Đạo hàm của sin x', '-cos x']) {
      expect(text, `không được in "${leaked}"`).not.toContain(leaked);
    }
  });
});

describe('LiveQuizSessionDrawer — kết thúc khẩn cấp', () => {
  it('thiếu gamification:update ⇒ không có nút, kể cả phiên đang diễn ra', async () => {
    mockDetail();
    renderDrawer();
    await screen.findByText('Ôn tập Giải tích 1');
    expect(screen.queryByRole('button', { name: 'Kết thúc khẩn cấp' })).not.toBeInTheDocument();
  });

  it('có quyền nhưng phiên đã FINISHED/CANCELLED ⇒ không có nút', async () => {
    signIn(['gamification:view', 'gamification:update']);
    mockDetail(makeDetail({ status: 'FINISHED', endReason: 'COMPLETED' }));
    const first = renderDrawer();
    await screen.findByText('Ôn tập Giải tích 1');
    expect(screen.queryByRole('button', { name: 'Kết thúc khẩn cấp' })).not.toBeInTheDocument();
    first.unmount();

    mockDetail(makeDetail({ status: 'CANCELLED', endReason: 'ADMIN_ENDED' }));
    renderDrawer();
    await screen.findByText('Ôn tập Giải tích 1');
    expect(screen.queryByRole('button', { name: 'Kết thúc khẩn cấp' })).not.toBeInTheDocument();
  });

  it('phiên WAITING cũng kết thúc được', async () => {
    signIn(['gamification:view', 'gamification:update']);
    mockDetail(makeDetail({ status: 'WAITING', currentIndex: 0, startedAt: null }));
    renderDrawer();
    expect(await screen.findByRole('button', { name: 'Kết thúc khẩn cấp' })).toBeInTheDocument();
  });

  it('lý do < 10 ký tự không gửi; đủ lý do → POST { reason } rồi tải lại phiên', async () => {
    signIn(['gamification:view', 'gamification:update']);
    let detailCalls = 0;
    let posted: unknown = null;
    server.use(
      http.get(DETAIL_URL, () => {
        detailCalls += 1;
        return okBody(
          detailCalls === 1
            ? makeDetail()
            : makeDetail({ status: 'CANCELLED', endReason: 'ADMIN_ENDED' }),
        );
      }),
      http.post(END_URL, async ({ request }) => {
        posted = await request.json();
        return okBody({ status: 'CANCELLED' });
      }),
    );
    renderDrawer();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Kết thúc khẩn cấp' }));

    const reason = screen.getByLabelText(/Lý do/);
    await user.type(reason, 'quá ngắn');
    await user.click(screen.getByRole('button', { name: 'Kết thúc phiên' }));
    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(posted).toBeNull();

    await user.clear(reason);
    await user.type(reason, 'Nội dung câu hỏi vi phạm, dừng phiên ngay');
    await user.click(screen.getByRole('button', { name: 'Kết thúc phiên' }));

    await waitFor(() =>
      expect(posted).toEqual({ reason: 'Nội dung câu hỏi vi phạm, dừng phiên ngay' }),
    );
    // Sau khi kết thúc, phiên được tải lại và nút biến mất (phiên đã huỷ).
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Kết thúc khẩn cấp' })).not.toBeInTheDocument(),
    );
    expect(detailCalls).toBeGreaterThanOrEqual(2);
  });

  it('BE trả QUIZ_007 (phiên vừa tự đóng): modal giữ mở để đọc lỗi, không báo thành công', async () => {
    signIn(['gamification:view', 'gamification:update']);
    mockDetail();
    server.use(
      http.post(END_URL, () =>
        errorBody(409, 'QUIZ_007', 'Thao tác không hợp lệ với trạng thái phiên hiện tại'),
      ),
    );
    renderDrawer();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Kết thúc khẩn cấp' }));
    await user.type(screen.getByLabelText(/Lý do/), 'Nội dung câu hỏi vi phạm, dừng phiên ngay');
    await user.click(screen.getByRole('button', { name: 'Kết thúc phiên' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Kết thúc phiên' })).toBeEnabled(),
    );
    expect(screen.getByLabelText(/Lý do/)).toBeInTheDocument();
    expect(screen.queryByText('Đã kết thúc phiên và ghi nhật ký')).not.toBeInTheDocument();
  });
});

describe('LiveQuizSessionDrawer — trạng thái lỗi', () => {
  it('404 (QUIZ_001): "Không tìm thấy phiên", KHÔNG có "Thử lại"', async () => {
    server.use(http.get(DETAIL_URL, () => errorBody(404, 'QUIZ_001', 'Không tìm thấy')));
    renderDrawer();
    expect(await screen.findByText('Không tìm thấy phiên')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('lỗi máy chủ: báo lỗi có "Thử lại", bấm là tải lại thành công', async () => {
    let calls = 0;
    server.use(
      http.get(DETAIL_URL, () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_500', 'Lỗi hệ thống') : okBody(makeDetail());
      }),
    );
    renderDrawer();
    expect(await screen.findByText('Không tải được phiên')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Ôn tập Giải tích 1')).toBeInTheDocument();
  });
});
