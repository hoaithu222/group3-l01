/**
 * `ModerationQueuePage` (p1-08 admin.md §2.1, §4): hàng đợi báo cáo gộp theo đích — bộ lọc/sắp xếp/
 * phân trang đồng bộ URL, "Riêng tư" chỉ là nhãn (không tên kênh riêng tư/nhóm chat), liên kết
 * sang chi tiết giữ bộ lọc, và làm mới theo realtime (`moderation:report-created|updated`).
 *
 * Mock ở tầng HTTP (MSW) và socket giả — KHÔNG mock service/queries/hook — để đi đúng đường thật
 * (axios, `useQueryParams`, React Query, `useRoomSubscription`).
 */
import { act, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { useLocation } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRoomSubscriptions } from '@/core/socket';
import ModerationQueuePage from '@/features/moderation/pages/ModerationQueuePage';
import type { AdminReportGroup } from '@/features/moderation/types/moderation.types';

import { emitFromServer, fakeSocket, joinPayloads } from './fake-socket';
import {
  errorJson,
  makeGroup,
  okJson,
  pageMeta,
  PERM_VIEW,
  renderRoutes,
  signIn,
  WORKSPACE_ID,
} from './moderation-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('./fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

const PUBLIC_MSG = makeGroup({ reportId: 'r-public', targetId: 'm-1', reportCount: 5 });
const PRIVATE_CHANNEL = makeGroup({
  reportId: 'r-private',
  targetId: 'm-2',
  reportCount: 2,
  reasons: ['HARASSMENT'],
  // BE không bao giờ trả tên kênh riêng tư — MSW chèn vào để chứng minh giao diện bỏ qua.
  scope: { type: 'CHANNEL', isPrivate: true, name: 'Kênh-bí-mật-XYZ' },
});
const GROUP_CHAT = makeGroup({
  reportId: 'r-group',
  targetId: 'm-3',
  reasons: ['SCAM'],
  scope: { type: 'CONVERSATION', isPrivate: true, name: 'Nhóm-kín-ABC' },
});
const DIRECT = makeGroup({
  reportId: 'r-direct',
  targetId: 'm-4',
  workspace: undefined,
  reasons: ['OTHER'],
  scope: { type: 'CONVERSATION', isPrivate: true },
  handlerLevel: 'PLATFORM_ONLY',
});
const USER_GROUP = makeGroup({
  reportId: 'r-user',
  targetType: 'USER',
  targetId: 'u-1',
  scope: { type: null, isPrivate: false },
});
const ALL_ROWS = [PUBLIC_MSG, PRIVATE_CHANNEL, GROUP_CHAT, DIRECT, USER_GROUP];

const requests: URLSearchParams[] = [];
const lastParams = () => requests[requests.length - 1];

/** Trả `rows` cho mọi lần gọi `GET /admin/reports`; ghi lại query để khẳng định. */
function reportsHandler(rows: AdminReportGroup[] = ALL_ROWS, total = rows.length) {
  return http.get('*/admin/reports', ({ request }) => {
    const params = new URL(request.url).searchParams;
    requests.push(params);
    return okJson(
      rows,
      pageMeta(total, Number(params.get('page') ?? 1), Number(params.get('limit') ?? 20)),
    );
  });
}

const server = setupServer(
  http.get('*/admin/workspaces', () =>
    okJson(
      [
        { id: WORKSPACE_ID, name: 'Nhóm Alpha' },
        { id: '665f1c2e8a1b2c3d4e5f6aaa', name: 'Nhóm Beta' },
      ],
      pageMeta(2),
    ),
  ),
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
  requests.length = 0;
  fakeSocket.emit.mockClear();
  resetRoomSubscriptions();
  signIn([...PERM_VIEW, 'workspace:view', 'user:view']);
});

/** Chỗ `/moderation/:id` — chỉ để đọc `location.state` mà liên kết mang theo. */
function DetailProbe() {
  const { state, pathname } = useLocation();
  return <output data-testid="detail">{`${pathname}|${JSON.stringify(state)}`}</output>;
}

function renderQueue(url = '/moderation') {
  return renderRoutes(
    [
      { path: '/moderation', element: <ModerationQueuePage /> },
      { path: '/moderation/:id', element: <DetailProbe /> },
    ],
    [url],
  );
}

const search = (router: ReturnType<typeof renderQueue>['router']) =>
  new URLSearchParams(router.state.location.search);

/** Ô chọn (Radix `combobox`) có nhãn hiện tại chứa `text`. */
function combo(text: string): HTMLElement {
  const found = screen.getAllByRole('combobox').find((el) => el.textContent?.includes(text));
  if (!found) throw new Error(`Không có ô chọn "${text}"`);
  return found;
}

describe('hàng đợi — dữ liệu và riêng tư', () => {
  it('gọi API với mặc định status=OPEN, sort=reportCount, page=1 và hiện các nhóm báo cáo', async () => {
    server.use(reportsHandler());
    renderQueue();

    expect(await screen.findByText('#general')).toBeInTheDocument();
    expect(lastParams().get('status')).toBe('OPEN');
    expect(lastParams().get('sort')).toBe('reportCount');
    expect(lastParams().get('page')).toBe('1');
    expect(lastParams().get('limit')).toBe('20');
    expect(lastParams().get('workspaceId')).toBeNull();
    // 5 dòng dữ liệu (+1 dòng tiêu đề).
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(ALL_ROWS.length + 1);
    // Dòng đầu là nhóm 5 báo cáo, lý do Spam.
    expect(within(rows[1]).getByText('5')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Spam')).toBeInTheDocument();
  });

  it('kênh riêng tư/nhóm chat chỉ là nhãn "Riêng tư" — KHÔNG hiện tên dù payload có mang theo', async () => {
    server.use(reportsHandler());
    renderQueue();
    await screen.findByText('#general');

    expect(screen.queryByText(/Kênh-bí-mật-XYZ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nhóm-kín-ABC/)).not.toBeInTheDocument();
    expect(screen.getByText('Kênh riêng tư')).toBeInTheDocument();
    // Ba đích trong phạm vi riêng tư (kênh riêng tư, nhóm chat, 1-1) đều có nhãn.
    expect(screen.getAllByText('Riêng tư')).toHaveLength(3);
    expect(screen.getByText('Tin nhắn 1-1')).toBeInTheDocument();
    expect(screen.getAllByText('Nhóm chat').length).toBeGreaterThan(0);
  });

  it('không có dữ liệu → trạng thái rỗng; lỗi tải → Callout kèm "Thử lại"', async () => {
    server.use(reportsHandler([]));
    const { unmount } = renderQueue();
    expect(await screen.findByText('Chưa có báo cáo nào ở trạng thái này')).toBeInTheDocument();
    unmount();

    let fail = true;
    server.use(
      http.get('*/admin/reports', () =>
        fail ? errorJson(500, 'SYS_001', 'Lỗi máy chủ') : okJson([PUBLIC_MSG], pageMeta(1)),
      ),
    );
    renderQueue();
    expect(await screen.findByText('Không tải được hàng đợi báo cáo')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('#general')).toBeInTheDocument();
  });
});

describe('hàng đợi — bộ lọc, sắp xếp, phân trang (URL)', () => {
  it('chọn trạng thái → URL + query có status', async () => {
    server.use(reportsHandler());
    const { router } = renderQueue();
    await screen.findByText('#general');

    await userEvent.click(combo('Chờ xử lý'));
    await userEvent.click(await screen.findByRole('option', { name: 'Đã xử lý' }));

    await waitFor(() => expect(search(router).get('status')).toBe('RESOLVED'));
    await waitFor(() => expect(lastParams().get('status')).toBe('RESOLVED'));
  });

  it('chọn loại đích và lý do → query có targetType, reason', async () => {
    server.use(reportsHandler());
    const { router } = renderQueue();
    await screen.findByText('#general');

    await userEvent.click(combo('Mọi loại đích'));
    await userEvent.click(await screen.findByRole('option', { name: 'Kênh' }));
    await waitFor(() => expect(lastParams().get('targetType')).toBe('CHANNEL'));

    await userEvent.click(combo('Mọi lý do'));
    await userEvent.click(await screen.findByRole('option', { name: 'Lừa đảo' }));
    await waitFor(() => expect(lastParams().get('reason')).toBe('SCAM'));
    expect(search(router).get('targetType')).toBe('CHANNEL');
    expect(search(router).get('reason')).toBe('SCAM');
  });

  it('sắp xếp "Mới nhất" → sort=latest; quay lại mặc định thì xoá khỏi URL', async () => {
    server.use(reportsHandler());
    const { router } = renderQueue();
    await screen.findByText('#general');

    await userEvent.click(combo('Nhiều báo cáo nhất'));
    await userEvent.click(await screen.findByRole('option', { name: 'Mới nhất' }));
    await waitFor(() => expect(lastParams().get('sort')).toBe('latest'));
    expect(search(router).get('sort')).toBe('latest');

    await userEvent.click(combo('Mới nhất'));
    await userEvent.click(await screen.findByRole('option', { name: 'Nhiều báo cáo nhất' }));
    await waitFor(() => expect(search(router).has('sort')).toBe(false));
  });

  it('lọc workspace (có workspace:view) → query có workspaceId; "Xoá bộ lọc" đưa về mặc định', async () => {
    server.use(reportsHandler());
    const { router } = renderQueue();
    await screen.findByText('#general');

    await userEvent.click(combo('Mọi workspace'));
    await userEvent.click(await screen.findByRole('option', { name: 'Nhóm Alpha' }));
    await waitFor(() => expect(lastParams().get('workspaceId')).toBe(WORKSPACE_ID));

    await userEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    await waitFor(() => expect(lastParams().get('workspaceId')).toBeNull());
    expect(router.state.location.search).toBe('');
  });

  it('thiếu workspace:view → KHÔNG có ô lọc workspace và không gọi /admin/workspaces', async () => {
    signIn(PERM_VIEW);
    let workspaceCalls = 0;
    server.use(
      reportsHandler(),
      http.get('*/admin/workspaces', () => {
        workspaceCalls += 1;
        return okJson([], pageMeta(0));
      }),
    );
    renderQueue();
    await screen.findByText('#general');

    expect(screen.queryByText('Mọi workspace')).not.toBeInTheDocument();
    expect(workspaceCalls).toBe(0);
  });

  it('phân trang server: 45 nhóm, bấm trang 2 → page=2 trên URL và query', async () => {
    server.use(reportsHandler(ALL_ROWS, 45));
    const { router } = renderQueue();
    await screen.findByText('#general');

    await userEvent.click(screen.getByRole('button', { name: 'Trang 2' }));

    await waitFor(() => expect(lastParams().get('page')).toBe('2'));
    expect(search(router).get('page')).toBe('2');
  });

  it('URL mang giá trị lạ (status=ACTIVE, targetType=X) → rơi về OPEN, KHÔNG gửi lên BE', async () => {
    server.use(reportsHandler());
    renderQueue('/moderation?status=ACTIVE&targetType=X&workspaceId=khong-phai-objectid');
    await screen.findByText('#general');

    expect(lastParams().get('status')).toBe('OPEN');
    expect(lastParams().get('targetType')).toBeNull();
    expect(lastParams().get('workspaceId')).toBeNull();
  });
});

describe('hàng đợi — điều hướng sang chi tiết', () => {
  it('cột "Đích" là liên kết THẬT tới /moderation/:id (mở tab mới được)', async () => {
    server.use(reportsHandler());
    renderQueue();
    await screen.findByText('#general');

    const links = screen.getAllByRole('link', { name: 'Tin nhắn' });
    expect(links[0]).toHaveAttribute('href', '/moderation/r-public');
  });

  it('bấm dòng → sang chi tiết, mang theo bộ lọc hiện tại để quay lại đúng hàng đợi', async () => {
    server.use(reportsHandler());
    renderQueue('/moderation?status=OPEN&reason=SPAM');
    await screen.findByText('#general');

    await userEvent.click(screen.getByText('#general'));

    const detail = await screen.findByTestId('detail');
    expect(detail).toHaveTextContent('/moderation/r-public|');
    expect(detail.textContent).toContain('/moderation?status=OPEN&reason=SPAM');
  });

  it('tên tác giả là liên kết hồ sơ khi có user:view, chỉ là chữ khi thiếu', async () => {
    server.use(reportsHandler([PUBLIC_MSG]));
    const { unmount } = renderQueue();
    expect(await screen.findByRole('link', { name: 'Nguyễn Văn An' })).toHaveAttribute(
      'href',
      `/user/${PUBLIC_MSG.targetAuthor?.id}`,
    );
    unmount();

    signIn(PERM_VIEW);
    renderQueue();
    expect(await screen.findByText('Nguyễn Văn An')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nguyễn Văn An' })).not.toBeInTheDocument();
  });
});

describe('hàng đợi — realtime (admin:moderation)', () => {
  it('vào phòng admin:moderation; report-created → tải lại và dòng mới xuất hiện', async () => {
    let rows: AdminReportGroup[] = [PUBLIC_MSG];
    server.use(http.get('*/admin/reports', () => okJson(rows, pageMeta(rows.length))));
    renderQueue();
    await screen.findByText('#general');
    expect(joinPayloads()).toEqual([{ kind: 'admin', id: 'moderation' }]);
    expect(screen.queryByText('Tin nhắn 1-1')).not.toBeInTheDocument();

    rows = [PUBLIC_MSG, DIRECT];
    act(() =>
      emitFromServer('moderation:report-created', {
        v: 1,
        groupKey: DIRECT.groupKey,
        targetType: 'MESSAGE',
        reportCount: 1,
      }),
    );

    expect(await screen.findByText('Tin nhắn 1-1')).toBeInTheDocument();
  });

  it('report-updated → tải lại: nhóm vừa được xử lý biến khỏi hàng đợi OPEN', async () => {
    let rows: AdminReportGroup[] = [PUBLIC_MSG, DIRECT];
    server.use(http.get('*/admin/reports', () => okJson(rows, pageMeta(rows.length))));
    renderQueue();
    await screen.findByText('Tin nhắn 1-1');

    rows = [PUBLIC_MSG];
    act(() =>
      emitFromServer('moderation:report-updated', {
        v: 1,
        groupKey: DIRECT.groupKey,
        status: 'RESOLVED',
        resolution: 'CONTENT_REMOVED',
      }),
    );

    await waitFor(() => expect(screen.queryByText('Tin nhắn 1-1')).not.toBeInTheDocument());
    expect(within(screen.getByRole('table')).getByText('#general')).toBeInTheDocument();
  });

  it('thiếu moderation:view → KHÔNG xin vào phòng', async () => {
    signIn([]);
    server.use(reportsHandler());
    renderQueue();
    await screen.findByText('#general');

    expect(joinPayloads()).toEqual([]);
  });
});
