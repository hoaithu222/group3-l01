/**
 * Khối "Chấm chéo" trong tab "Dự án" của workspace (p4-05 admin.md §2.2, §4) — CHỈ số đếm + tên bảng, KHÔNG tên người
 * chấm/điểm/nhận xét/tiêu đề thẻ, KHÔNG hành động ghi; Callout khi tỉ lệ tự duyệt > 30 %. Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { WorkspaceReviewStats } from '@/features/peer-review';

import { errorBody, okBody, REVIEW_STATS, renderWithQuery, signIn } from './review-fixtures';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['workspace:view']));

const URL_PATTERN = '*/admin/workspaces/:id/review-stats';
const renderBlock = () => renderWithQuery(<WorkspaceReviewStats workspaceId="ws-1" />);
/** Thẻ số liệu là nhãn + giá trị cùng một khối — lấy khối theo nhãn. */
const kpi = (label: string) => screen.getByText(label).parentElement as HTMLElement;

/** Response "vi phạm hợp đồng": kèm tên người chấm, điểm, nhận xét, tiêu đề thẻ mà admin tuyệt đối không được thấy. */
const LEAKY_RESPONSE = {
  ...REVIEW_STATS,
  reviews: [
    {
      reviewerName: 'Nguyễn Văn Lộ',
      score10: 8.75,
      feedback: 'Nhận xét bí mật của người chấm',
      taskTitle: 'Thẻ bí mật của nhóm',
    },
  ],
  byBoard: REVIEW_STATS.byBoard.map((b) => ({
    ...b,
    reviewerName: 'Trần Thị Chấm',
    score10: 9.25,
    taskTitle: 'Tiêu đề thẻ rò rỉ',
  })),
};

describe('WorkspaceReviewStats — số liệu', () => {
  it('hiện 5 KPI (mở, quá 72 giờ, trung vị, tự duyệt, miễn chấm) và bảng theo bảng; gọi ?days=30', async () => {
    let days: string | null = null;
    server.use(
      http.get(URL_PATTERN, ({ request }) => {
        days = new URL(request.url).searchParams.get('days');
        return okBody(REVIEW_STATS);
      }),
    );
    renderBlock();

    expect(await screen.findByText('Chấm chéo')).toBeInTheDocument();
    expect(kpi('Lượt chấm đang mở')).toHaveTextContent('4');
    expect(kpi('Lượt chấm đang mở')).toHaveTextContent('7 lượt đang chờ người chấm nộp');
    expect(kpi('Lượt chờ quá 72 giờ')).toHaveTextContent('2');
    expect(kpi('Thời gian chấm trung vị')).toHaveTextContent('18,5 giờ');
    expect(kpi('Lượt tự duyệt do thiếu người')).toHaveTextContent('2');
    expect(kpi('Lượt tự duyệt do thiếu người')).toHaveTextContent('Trên 20 lượt mở (30 ngày)');
    expect(kpi('Lượt được miễn chấm (30 ngày)')).toHaveTextContent('1');
    expect(days).toBe('30');

    // Bảng theo bảng: tên bảng (metadata tổ chức), bật/tắt, số lượt mở.
    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('Đồ án cuối kỳ');
    expect(table).toHaveTextContent('Sprint cũ');
    expect(table).toHaveTextContent('Bật');
    expect(table).toHaveTextContent('Tắt');
  });

  it('chưa có lượt nộp nào ⇒ thời gian trung vị hiện "—" kèm lời giải thích (không hiện 0 giờ giả)', async () => {
    server.use(http.get(URL_PATTERN, () => okBody({ ...REVIEW_STATS, medianHoursToSubmit: null })));
    renderBlock();

    await screen.findByText('Chấm chéo');
    expect(kpi('Thời gian chấm trung vị')).toHaveTextContent('—');
    expect(kpi('Thời gian chấm trung vị')).toHaveTextContent('Chưa có lượt nộp nào trong 30 ngày');
    expect(kpi('Thời gian chấm trung vị')).not.toHaveTextContent('0 giờ');
  });

  it('nhóm chưa có bảng nào ⇒ bảng báo rỗng, KPI vẫn hiện', async () => {
    server.use(http.get(URL_PATTERN, () => okBody({ ...REVIEW_STATS, byBoard: [] })));
    renderBlock();

    expect(await screen.findByText('Nhóm chưa có bảng công việc nào')).toBeInTheDocument();
    expect(kpi('Lượt chấm đang mở')).toHaveTextContent('4');
  });

  it('fixture thừa tên người chấm, điểm, nhận xét, tiêu đề thẻ ⇒ KHÔNG xuất hiện trong DOM (PM2-32)', async () => {
    server.use(http.get(URL_PATTERN, () => okBody(LEAKY_RESPONSE)));
    renderBlock();

    await screen.findByText('Chấm chéo');
    const text = document.body.textContent ?? '';
    for (const leaked of [
      'Nguyễn Văn Lộ',
      'Trần Thị Chấm',
      '8,75',
      '8.75',
      '9,25',
      '9.25',
      'Nhận xét bí mật',
      'Thẻ bí mật',
      'Tiêu đề thẻ rò rỉ',
    ]) {
      expect(text, `lộ "${leaked}"`).not.toContain(leaked);
    }
  });

  it('không có hành động ghi nào (chấm chéo thuộc chủ nhóm)', async () => {
    signIn(['workspace:view', 'workspace:update', 'system-config:update']);
    server.use(http.get(URL_PATTERN, () => okBody(REVIEW_STATS)));
    renderBlock();

    await screen.findByText('Chấm chéo');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('WorkspaceReviewStats — gợi ý vận hành (tỉ lệ tự duyệt)', () => {
  it('40 % lượt tự duyệt ⇒ Callout "Nhóm có thể quá nhỏ…" nêu tỉ lệ, chỉ thông tin (không có nút hành động)', async () => {
    server.use(
      http.get(URL_PATTERN, () =>
        okBody({ ...REVIEW_STATS, roundsInPeriod: 10, autoApprovedRounds: 4 }),
      ),
    );
    renderBlock();

    expect(
      await screen.findByText('Nhóm có thể quá nhỏ cho số lượt duyệt đang đặt'),
    ).toBeInTheDocument();
    expect(screen.getByText(/40,0\s?% lượt chấm trong 30 ngày phải tự duyệt/)).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('đúng 30 % (không vượt ngưỡng) hoặc chưa có lượt nào ⇒ không có Callout', async () => {
    server.use(
      http.get(URL_PATTERN, () =>
        okBody({ ...REVIEW_STATS, roundsInPeriod: 10, autoApprovedRounds: 3 }),
      ),
    );
    const { unmount } = renderBlock();
    await screen.findByText('Chấm chéo');
    expect(screen.queryByText(/quá nhỏ cho số lượt duyệt/)).not.toBeInTheDocument();
    unmount();

    server.use(
      http.get(URL_PATTERN, () =>
        okBody({ ...REVIEW_STATS, roundsInPeriod: 0, autoApprovedRounds: 0 }),
      ),
    );
    renderBlock();
    await screen.findByText('Chấm chéo');
    expect(screen.queryByText(/quá nhỏ cho số lượt duyệt/)).not.toBeInTheDocument();
  });
});

describe('WorkspaceReviewStats — trạng thái tải', () => {
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
    expect(screen.queryByText('Chấm chéo')).not.toBeInTheDocument();
    expect(screen.queryByText('Không tải được số liệu chấm chéo')).not.toBeInTheDocument();
  });

  it('lỗi máy chủ ⇒ báo lỗi có "Thử lại", bấm là tải lại thành công; không hiện số 0 giả', async () => {
    let calls = 0;
    server.use(
      http.get(URL_PATTERN, () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_500', 'Lỗi hệ thống') : okBody(REVIEW_STATS);
      }),
    );
    renderBlock();

    expect(await screen.findByText('Không tải được số liệu chấm chéo')).toBeInTheDocument();
    expect(screen.queryByText('Lượt chấm đang mở')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Lượt chấm đang mở')).toBeInTheDocument();
  });

  it('thiếu quyền (403) ⇒ giải thích, KHÔNG có "Thử lại"', async () => {
    server.use(http.get(URL_PATTERN, () => errorBody(403, 'AUTH_005', 'Không đủ quyền')));
    renderBlock();

    expect(await screen.findByText('Không tải được số liệu chấm chéo')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản của bạn không có quyền xem mục này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('nhóm không còn (404 khác CFG_005) ⇒ giải thích, KHÔNG có "Thử lại"', async () => {
    server.use(http.get(URL_PATTERN, () => errorBody(404, 'RES_001', 'Không tìm thấy nhóm')));
    renderBlock();

    expect(await screen.findByText('Không tải được số liệu chấm chéo')).toBeInTheDocument();
    expect(
      screen.getByText('Dữ liệu này không còn tồn tại hoặc đã bị gỡ.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});

describe('kiểu dữ liệu — không có trường về người chấm/điểm/nhận xét/thẻ', () => {
  it('peer-review.types.ts chỉ khai số đếm + tên bảng (quét theo từ khoá nhạy cảm, bỏ chú thích)', () => {
    const sources = import.meta.glob('../../../src/features/peer-review/types/peer-review.types.ts', {
      eager: true,
      query: '?raw',
      import: 'default',
    }) as Record<string, string>;
    const raw = Object.values(sources)[0];
    expect(raw, 'không đọc được file kiểu').toBeTruthy();

    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(
      /\b(reviewers?|users?|scores?|score10|feedback|comments?|tasks?|title|email|assignee|rubric)\b/i,
    );
    expect(code).toMatch(/openRounds/);
    expect(code).toMatch(/overdue72h/);
    expect(code).toMatch(/roundsInPeriod/);
  });
});
