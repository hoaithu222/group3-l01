/**
 * Kiểm duyệt BỘ HỌC (p4-01 admin.md §2.1, §4): báo cáo `STUDY_SET` trên trang chi tiết moderation.
 * - bộ PUBLIC: ngữ cảnh + bảng nội dung (rút 200 ký tự, đáp án, "Có ảnh") phân trang 50;
 * - bộ WORKSPACE: KHÔNG gọi route mục, KHÔNG có chữ nào của mục trên DOM kể cả khi BE lỡ trả — "chỉ thông tin chung";
 * - ẩn/khôi phục: lý do ≥ 10 ký tự mới gửi, thành công → trạng thái "Đã ẩn" + toast "ghi nhật ký";
 *   `STUDY_004` (người khác vừa ẩn) đồng bộ lại thay vì kẹt modal;
 * - `moderation:view` thôi → không thấy nút; hành động báo cáo theo loại đích (không "Gỡ nội dung").
 *
 * Mock ở tầng HTTP (MSW) — lỗi đi qua axios interceptor thật.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRoomSubscriptions } from '@/core/socket';
import { REPORT_TARGET_TYPE_OPTIONS } from '@/features/moderation/constants/moderation.constants';
import ReportDetailPage from '@/features/moderation/pages/ReportDetailPage';
import type { ReportDetail } from '@/features/moderation/types/moderation.types';
import type {
  AdminStudyItem,
  AdminStudySet,
} from '@/features/moderation/types/study-set-moderation.types';
import { availableActions } from '@/features/moderation/utils/report-actions';
import { scopeLabel } from '@/features/moderation/utils/report-links';
import { studyItemAnswer, studyItemMedia } from '@/features/moderation/utils/study-items';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { fakeSocket } from './fake-socket';
import {
  AUTHOR_ID,
  errorJson,
  makeDetail,
  makeGroup,
  okJson,
  pageMeta,
  PERM_MODERATE_LOCK,
  PERM_VIEW,
  renderRoutes,
  REPORT_ID,
  signIn,
  WORKSPACE_ID,
} from './moderation-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket: shared } = await import('./fake-socket');
  return { io: vi.fn(() => shared) };
});

const SET_ID = '665f1c2e8a1b2c3d4e5f6b01';
const NOW = '2026-09-21T03:00:00.000Z';

function makeSet(overrides: Partial<AdminStudySet> = {}): AdminStudySet {
  return {
    id: SET_ID,
    ownerId: AUTHOR_ID,
    owner: { id: AUTHOR_ID, name: 'Nguyễn Văn An' },
    workspaceId: null,
    title: 'Từ vựng IELTS 7.0',
    description: 'Bộ từ vựng',
    tags: ['ielts', 'từ vựng'],
    coverAssetId: null,
    coverThumbUrl: null,
    language: 'en',
    visibility: 'PUBLIC',
    status: 'ACTIVE',
    itemCount: 3,
    hasQuiz: true,
    copyCount: 12,
    copiedFromId: null,
    version: 4,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: NOW,
    itemTypesMask: 3,
    reportedCount: 5,
    hiddenReason: null,
    hiddenBy: null,
    hiddenAt: null,
    canViewContent: true,
    ...overrides,
  };
}

const LONG_PROMPT = `${'Câu hỏi rất dài '.repeat(20)}KẾT-THÚC`;

const ITEMS: AdminStudyItem[] = [
  {
    id: 'i-1',
    setId: SET_ID,
    type: 'FLASHCARD',
    prompt: LONG_PROMPT,
    answerText: 'Mặt sau của thẻ',
    options: [],
    correctOptionIds: [],
    acceptedAnswers: [],
    explanation: null,
    frontMediaAssetId: 'asset-front',
    backMediaAssetId: null,
    audioAssetId: null,
    tags: [],
    order: 0,
    updatedAt: NOW,
  },
  {
    id: 'i-2',
    setId: SET_ID,
    type: 'MULTIPLE_CHOICE',
    prompt: 'Thủ đô của Pháp là?',
    answerText: null,
    options: [
      { id: 'o_aaaaaa', text: 'Berlin', mediaAssetId: null },
      { id: 'o_bbbbbb', text: 'Paris', mediaAssetId: null },
    ],
    correctOptionIds: ['o_bbbbbb'],
    acceptedAnswers: [],
    explanation: null,
    frontMediaAssetId: null,
    backMediaAssetId: null,
    audioAssetId: 'asset-audio',
    tags: [],
    order: 1,
    updatedAt: NOW,
  },
  {
    id: 'i-3',
    setId: SET_ID,
    type: 'FILL_BLANK',
    prompt: 'Nước sôi ở __ độ C',
    answerText: null,
    options: [],
    correctOptionIds: [],
    acceptedAnswers: ['100', 'một trăm'],
    explanation: null,
    frontMediaAssetId: null,
    backMediaAssetId: null,
    audioAssetId: null,
    tags: [],
    order: 2,
    updatedAt: NOW,
  },
];

let detail: ReportDetail;
let studySet: AdminStudySet;
let itemsCalls: URLSearchParams[] = [];
let decisionCalls: Array<{ kind: 'hide' | 'restore'; body: Record<string, unknown> }> = [];
/** Khác `undefined` ⇒ POST hide/restore trả lỗi này (và bộ đổi trạng thái như thể người khác vừa ẩn). */
let decisionFailure: { status: number; code: string; message: string } | undefined;

const server = setupServer(
  http.get('*/admin/reports/:id', () => okJson(detail)),
  http.get('*/audit-logs', () => okJson([], { nextCursor: null, hasMore: false, limit: 20 })),
  http.get('*/admin/study-sets/:id/items', ({ request }) => {
    itemsCalls.push(new URL(request.url).searchParams);
    return okJson(ITEMS, pageMeta(ITEMS.length, 1, 50));
  }),
  http.get('*/admin/study-sets/:id', () => okJson(studySet)),
  http.post('*/admin/study-sets/:id/hide', async ({ request }) => {
    decisionCalls.push({ kind: 'hide', body: (await request.json()) as Record<string, unknown> });
    studySet = { ...studySet, status: 'HIDDEN', hiddenReason: 'lý do', hiddenAt: NOW };
    if (decisionFailure) {
      return errorJson(decisionFailure.status, decisionFailure.code, decisionFailure.message);
    }
    return okJson(studySet);
  }),
  http.post('*/admin/study-sets/:id/restore', async ({ request }) => {
    decisionCalls.push({
      kind: 'restore',
      body: (await request.json()) as Record<string, unknown>,
    });
    studySet = { ...studySet, status: 'ACTIVE', hiddenReason: null, hiddenAt: null };
    return okJson(studySet);
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

function studyDetail(groupOverrides = {}): ReportDetail {
  return makeDetail({
    group: makeGroup({
      targetType: 'STUDY_SET',
      targetId: SET_ID,
      groupKey: `STUDY_SET:${SET_ID}`,
      reasons: ['COPYRIGHT', 'WRONG_CONTENT'],
      scope: { type: null, isPrivate: false },
      workspace: undefined,
      handlerLevel: 'PLATFORM_ONLY',
      ...groupOverrides,
    }),
    reports: [
      {
        id: REPORT_ID,
        reporter: { id: 'r-1', name: 'Trần Thị Bình' },
        reason: 'COPYRIGHT',
        description: 'Sao chép nguyên văn từ sách giáo trình',
        status: 'OPEN',
        createdAt: NOW,
      },
    ],
    publicContent: undefined,
  });
}

beforeEach(() => {
  detail = studyDetail();
  studySet = makeSet();
  itemsCalls = [];
  decisionCalls = [];
  decisionFailure = undefined;
  fakeSocket.emit.mockClear();
  resetRoomSubscriptions();
  useToastStore.setState({ toasts: [] });
  signIn([...PERM_MODERATE_LOCK, 'user:view']);
});

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

function renderDetail() {
  return renderRoutes(
    [
      { path: '/moderation', element: <output data-testid="queue">hàng đợi</output> },
      { path: '/moderation/:id', element: <ReportDetailPage /> },
    ],
    [`/moderation/${REPORT_ID}`],
  );
}

describe('báo cáo STUDY_SET — bộ PUBLIC', () => {
  it('hiện ngữ cảnh bộ học, nhãn lý do mới và bảng nội dung (rút 200 ký tự, đáp án, đính kèm)', async () => {
    renderDetail();

    expect(await screen.findByText('Bộ học bị báo cáo')).toBeInTheDocument();
    expect(screen.getByText('Từ vựng IELTS 7.0')).toBeInTheDocument();
    // Tác giả xuất hiện ở khối ngữ cảnh báo cáo lẫn khối bộ học — cả hai đều dẫn tới hồ sơ (có `user:view`).
    for (const link of screen.getAllByRole('link', { name: 'Nguyễn Văn An' })) {
      expect(link).toHaveAttribute('href', `/user/${AUTHOR_ID}`);
    }
    expect(screen.getAllByText('Công khai').length).toBeGreaterThan(0);
    expect(screen.getByText('Đang hiển thị')).toBeInTheDocument();
    expect(screen.getByText('12 lần')).toBeInTheDocument();
    // Lý do báo cáo COPYRIGHT/WRONG_CONTENT có nhãn tiếng Việt (không rơi về mã thô).
    expect(screen.getAllByText('Vi phạm bản quyền').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nội dung sai').length).toBeGreaterThan(0);
    expect(screen.getByText('Sao chép nguyên văn từ sách giáo trình')).toBeInTheDocument();

    // Bảng nội dung: gọi đúng page/limit.
    expect(await screen.findByText('Nội dung bộ học (công khai)')).toBeInTheDocument();
    await screen.findByText('Thủ đô của Pháp là?');
    expect(itemsCalls[0].get('page')).toBe('1');
    expect(itemsCalls[0].get('limit')).toBe('50');
    // Câu hỏi quá dài bị cắt ở 200 ký tự (+ "..."), phần cuối không lên DOM.
    expect(screen.queryByText(/KẾT-THÚC/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Câu hỏi rất dài/)).toBeInTheDocument();
    // Đáp án: trắc nghiệm → chữ của lựa chọn ĐÚNG; điền chỗ trống → mọi đáp án chấp nhận; thẻ → mặt sau.
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
    expect(screen.getByText('100 · một trăm')).toBeInTheDocument();
    expect(screen.getByText('Mặt sau của thẻ')).toBeInTheDocument();
    expect(screen.getByText('Có ảnh')).toBeInTheDocument();
    expect(screen.getByText('Có âm thanh')).toBeInTheDocument();
  });

  it('khối quyết định của báo cáo: theo loại đích — có cảnh cáo/khoá/bỏ qua, KHÔNG có "Gỡ nội dung"', async () => {
    renderDetail();
    await screen.findByText('Quyết định');

    expect(screen.getByRole('button', { name: 'Cảnh cáo tác giả' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khoá tài khoản' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bỏ qua' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ nội dung' })).not.toBeInTheDocument();
  });
});

describe('báo cáo STUDY_SET — bộ WORKSPACE (riêng tư nhóm)', () => {
  beforeEach(() => {
    detail = studyDetail({
      workspace: { id: WORKSPACE_ID, name: 'Nhóm Alpha' },
      handlerLevel: 'SCOPE',
    });
    studySet = makeSet({
      visibility: 'WORKSPACE',
      workspaceId: WORKSPACE_ID,
      canViewContent: false,
    });
  });

  it('KHÔNG gọi route mục, KHÔNG có nội dung mục trên DOM (kể cả khi BE lỡ có sẵn dữ liệu)', async () => {
    const { container } = renderDetail();

    expect(await screen.findByText('Bộ học bị báo cáo')).toBeInTheDocument();
    expect(await screen.findByText(/chỉ hiển thị thông tin chung/)).toBeInTheDocument();
    // Cho mọi truy vấn còn lại (nhật ký…) chạy xong rồi mới khẳng định "không có".
    await screen.findByText('Quyết định');
    expect(itemsCalls).toEqual([]);
    const html = container.innerHTML;
    for (const leak of [
      'Thủ đô của Pháp',
      'Paris',
      'Mặt sau của thẻ',
      'Nước sôi',
      'Nội dung bộ học (công khai)',
    ]) {
      expect(html).not.toContain(leak);
    }
  });

  it('quản trị nền tảng không ẩn/khôi phục bộ WORKSPACE (BE trả 403) — chỉ giải thích, không nút', async () => {
    renderDetail();

    expect(
      await screen.findByText(/Chủ hoặc quản trị viên nhóm ẩn\/khôi phục bộ này/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ẩn bộ học' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khôi phục bộ học' })).not.toBeInTheDocument();
  });

  it('canViewContent=false dù visibility bị báo PUBLIC → vẫn không mở nội dung', async () => {
    studySet = makeSet({ visibility: 'PUBLIC', canViewContent: false });
    renderDetail();

    expect(await screen.findByText(/chỉ hiển thị thông tin chung/)).toBeInTheDocument();
    await screen.findByText('Quyết định');
    expect(itemsCalls).toEqual([]);
  });
});

describe('ẩn / khôi phục bộ học', () => {
  async function openHide() {
    await screen.findByText('Xử lý bộ học');
    await userEvent.click(await screen.findByRole('button', { name: 'Ẩn bộ học' }));
    return screen.findByRole('dialog');
  }

  it('lý do < 10 ký tự → báo lỗi, KHÔNG gọi API', async () => {
    renderDetail();
    const dialog = await openHide();

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'ngan qua');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ẩn bộ học' }));

    expect(await within(dialog).findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(decisionCalls).toEqual([]);
  });

  it('ẩn: gửi { reason }, thành công → trạng thái "Đã ẩn" + toast nhật ký + hiện "Khôi phục bộ học"', async () => {
    renderDetail();
    const dialog = await openHide();
    // Tác động nêu rõ hậu quả (đóng báo cáo mở).
    expect(within(dialog).getByText(/Mọi báo cáo đang mở của bộ được đóng/)).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Sao chép sách có bản quyền');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ẩn bộ học' }));

    await waitFor(() => expect(decisionCalls).toHaveLength(1));
    expect(decisionCalls[0]).toEqual({
      kind: 'hide',
      body: { reason: 'Sao chép sách có bản quyền' },
    });
    expect(await screen.findByText('Đã ẩn')).toBeInTheDocument();
    expect(toastTitles()).toContain('Đã ẩn bộ học và ghi nhật ký');
    expect(await screen.findByRole('button', { name: 'Khôi phục bộ học' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ẩn bộ học' })).not.toBeInTheDocument();
  });

  it('khôi phục: bộ đang ẩn → gửi { reason } đến /restore, trạng thái về "Đang hiển thị"', async () => {
    studySet = makeSet({ status: 'HIDDEN', hiddenReason: 'Vi phạm', hiddenAt: NOW });
    renderDetail();
    await screen.findByText('Xử lý bộ học');

    await userEvent.click(await screen.findByRole('button', { name: 'Khôi phục bộ học' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Đã xác minh là hợp lệ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Khôi phục' }));

    await waitFor(() => expect(decisionCalls).toHaveLength(1));
    expect(decisionCalls[0]).toEqual({
      kind: 'restore',
      body: { reason: 'Đã xác minh là hợp lệ' },
    });
    expect(await screen.findByText('Đang hiển thị')).toBeInTheDocument();
    expect(toastTitles()).toContain('Đã khôi phục bộ học và ghi nhật ký');
  });

  it('STUDY_004 (người khác vừa ẩn) → modal đóng, giao diện đồng bộ sang "Đã ẩn"', async () => {
    decisionFailure = { status: 409, code: 'STUDY_004', message: 'Bộ học đã bị ẩn' };
    renderDetail();
    const dialog = await openHide();

    await userEvent.type(within(dialog).getByLabelText(/Lý do/), 'Nội dung vi phạm bản quyền');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ẩn bộ học' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Đã ẩn')).toBeInTheDocument();
  });

  it('chỉ có moderation:view → KHÔNG thấy khối ẩn/khôi phục', async () => {
    signIn(PERM_VIEW);
    renderDetail();

    expect(await screen.findByText('Bộ học bị báo cáo')).toBeInTheDocument();
    await screen.findByText('Quyết định');
    expect(screen.queryByText('Xử lý bộ học')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ẩn bộ học' })).not.toBeInTheDocument();
  });

  it('bộ đã xoá → không còn thao tác', async () => {
    studySet = makeSet({ status: 'DELETED' });
    renderDetail();

    expect(
      await screen.findByText('Bộ học đã bị xoá, không còn thao tác nào.'),
    ).toBeInTheDocument();
  });
});

describe('báo cáo STUDY_SET — trạng thái lỗi', () => {
  it('404 (riêng tư/đã xoá) → "Bộ học không còn khả dụng"', async () => {
    server.use(
      http.get('*/admin/study-sets/:id', () => errorJson(404, 'PERM_404', 'Không tìm thấy')),
    );
    renderDetail();

    expect(await screen.findByText('Bộ học không còn khả dụng')).toBeInTheDocument();
    // Phần còn lại của báo cáo vẫn dùng được (bỏ qua báo cáo).
    expect(await screen.findByRole('button', { name: 'Bỏ qua' })).toBeInTheDocument();
  });

  it('404 CFG_005 (cờ study tắt) → "Học tập đang tắt"', async () => {
    server.use(
      http.get('*/admin/study-sets/:id', () => errorJson(404, 'CFG_005', 'Tính năng chưa bật')),
    );
    renderDetail();

    expect(await screen.findByText('Học tập đang tắt')).toBeInTheDocument();
  });

  it('lỗi 500 → "Không tải được bộ học" + Thử lại gọi lại API', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/study-sets/:id', () => {
        calls += 1;
        return calls === 1 ? errorJson(500, 'SYS_500', 'Lỗi hệ thống') : okJson(studySet);
      }),
    );
    renderDetail();

    expect(await screen.findByText('Không tải được bộ học')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Từ vựng IELTS 7.0')).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

describe('STUDY_SET — nhãn, phạm vi, hành động, tiện ích', () => {
  it('ô lọc loại đích có "Bộ học"', () => {
    expect(REPORT_TARGET_TYPE_OPTIONS).toContainEqual({ value: 'STUDY_SET', label: 'Bộ học' });
  });

  it('scopeLabel: có workspace ⇔ bộ trong nhóm; không → bộ công khai (không phải "—")', () => {
    const base = { targetType: 'STUDY_SET' as const, scope: { type: null, isPrivate: false } };
    expect(scopeLabel({ ...base, workspace: { id: WORKSPACE_ID, name: 'A' } })).toBe(
      'Bộ học trong nhóm',
    );
    expect(scopeLabel({ ...base, workspace: undefined })).toBe('Bộ học công khai');
  });

  it('availableActions STUDY_SET: cảnh cáo/khoá theo quyền + bỏ qua, không gỡ nội dung', () => {
    const target = { targetType: 'STUDY_SET' as const, scope: { type: null, isPrivate: false } };
    expect(availableActions(target, { canUpdate: true, canLockUser: true })).toEqual([
      'WARN_AUTHOR',
      'LOCK_AUTHOR',
      'DISMISS',
    ]);
    expect(availableActions(target, { canUpdate: true, canLockUser: false })).toEqual([
      'WARN_AUTHOR',
      'DISMISS',
    ]);
    expect(availableActions(target, { canUpdate: false, canLockUser: true })).toEqual([]);
  });

  it('studyItemAnswer / studyItemMedia: theo loại mục, thiếu chữ lựa chọn thì rơi về id', () => {
    const [flash, choice, fill] = ITEMS;
    expect(studyItemAnswer(flash)).toBe('Mặt sau của thẻ');
    expect(studyItemAnswer(choice)).toBe('Paris');
    expect(studyItemAnswer(fill)).toBe('100 · một trăm');
    expect(studyItemAnswer({ ...choice, options: [], correctOptionIds: ['o_bbbbbb'] })).toBe(
      'o_bbbbbb',
    );
    expect(studyItemAnswer({ ...flash, answerText: null })).toBeNull();
    expect(studyItemMedia(flash)).toEqual({ image: true, audio: false });
    expect(studyItemMedia(choice)).toEqual({ image: false, audio: true });
    expect(studyItemMedia(fill)).toEqual({ image: false, audio: false });
  });
});
