/**
 * Tab "Soạn thảo cộng tác" (p6-01 admin.md §2.1/§4): sức khoẻ dịch vụ (nhãn CHỮ cạnh màu; không phản hồi → Callout), thẻ số liệu tức thời ("—" khi
 * chưa có số, không phải 0), bảng tài liệu lớn KHÔNG hiện tiêu đề tài liệu PRIVATE (kể cả khi BE lỡ trả), nút dọn bản lưu chỉ có với
 * `system-config:update` và đòi lý do. Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import CollabOpsTab from '@/features/collab-ops/components/CollabOpsTab';
import type {
  CollabHealthView,
  CollabStatsView,
  LargeDocumentRow,
} from '@/features/collab-ops/types/collab-ops.types';
import { formatUptime } from '@/features/collab-ops/utils/collab-ops.utils';

import { HEALTH_OK, LARGE_DOCS, STATS_LIVE } from './collab-ops-fixtures';

const okBody = (data: unknown) => HttpResponse.json({ success: true, data });
const errBody = (status: number) =>
  HttpResponse.json(
    { success: false, error: { code: 'SYS_500', message: 'Lỗi máy chủ' } },
    { status },
  );

let health: CollabHealthView | 'error' = HEALTH_OK;
let stats: CollabStatsView | 'error' = STATS_LIVE;
let large: LargeDocumentRow[] | 'error' = LARGE_DOCS;
let cleanupBodies: unknown[] = [];
let largeLimits: Array<string | null> = [];

const server = setupServer(
  http.get('*/admin/collab/health', () => (health === 'error' ? errBody(500) : okBody(health))),
  http.get('*/admin/collab/stats', () => (stats === 'error' ? errBody(500) : okBody(stats))),
  http.get('*/admin/collab/documents/large', ({ request }) => {
    largeLimits.push(new URL(request.url).searchParams.get('limit'));
    return large === 'error' ? errBody(500) : okBody(large);
  }),
  http.post('*/admin/collab/cleanup-snapshots', async ({ request }) => {
    cleanupBodies.push(await request.json());
    return okBody({ scanned: 40, pruned: 7 });
  }),
  // Nhật ký (làm mới sau khi dọn) — không phải trọng tâm bài kiểm.
  http.get('*/audit-logs', () => HttpResponse.json({ success: true, data: [], meta: {} })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  health = HEALTH_OK;
  stats = STATS_LIVE;
  large = LARGE_DOCS;
  cleanupBodies = [];
  largeLimits = [];
  signIn(['integration:view']);
});

function signIn(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  // Vai KHÔNG phải `admin` — `admin` vượt mọi kiểm quyền chi tiết nên sẽ che lỗi phân quyền.
  useAuthStore.getState().setAuth({
    user: { id: 'ops1', email: 'ops@congty.vn', name: 'Vận hành', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CollabOpsTab />
    </QueryClientProvider>,
  );
}

const card = (label: string) => screen.getByText(label).parentElement as HTMLElement;

describe('CollabOpsTab — sức khoẻ dịch vụ', () => {
  it('ok: nhãn "Hoạt động" bằng CHỮ, phiên bản, thời gian chạy, loại tài nguyên; không có Callout sự cố', async () => {
    renderTab();

    expect(await screen.findByText('Hoạt động')).toBeInTheDocument();
    expect(screen.getByText('1.4.2')).toBeInTheDocument();
    expect(screen.getByText('3 ngày 4 giờ')).toBeInTheDocument();
    expect(screen.getByText('Tài liệu, Bảng trắng')).toBeInTheDocument();
    expect(screen.queryByText('Dịch vụ soạn thảo cộng tác không phản hồi')).not.toBeInTheDocument();
  });

  it('down: Callout lỗi kèm hướng dẫn kiểm compose', async () => {
    health = { enabled: true, status: 'down' };
    renderTab();

    expect(await screen.findByText('Không phản hồi')).toBeInTheDocument();
    expect(screen.getByText('Dịch vụ soạn thảo cộng tác không phản hồi')).toBeInTheDocument();
    expect(screen.getByText(/docker compose/)).toBeInTheDocument();
  });

  it('degraded: Callout cảnh báo "suy giảm"', async () => {
    health = { enabled: true, status: 'degraded', detail: { httpStatus: 503 } };
    renderTab();

    expect(await screen.findByText('Suy giảm')).toBeInTheDocument();
    expect(screen.getByText('Dịch vụ soạn thảo cộng tác đang suy giảm')).toBeInTheDocument();
  });

  it('disabled: hướng dẫn cấu hình COLLAB_*, KHÔNG nói "không phản hồi"', async () => {
    health = { enabled: false, status: 'disabled' };
    renderTab();

    expect(await screen.findByText('Chưa cấu hình')).toBeInTheDocument();
    expect(screen.getByText('Dịch vụ soạn thảo cộng tác chưa được cấu hình')).toBeInTheDocument();
    expect(screen.queryByText('Dịch vụ soạn thảo cộng tác không phản hồi')).not.toBeInTheDocument();
  });

  it('tải sức khoẻ lỗi (BE 500) → Callout "Không tải được" + "Thử lại"; thử lại khi BE hồi phục hiện trạng thái thật', async () => {
    health = 'error';
    renderTab();

    const title = await screen.findByText('Không tải được trạng thái dịch vụ soạn thảo cộng tác');
    health = HEALTH_OK;
    await userEvent
      .setup()
      .click(within(title.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Hoạt động')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được trạng thái dịch vụ soạn thảo cộng tác')).not.toBeInTheDocument();
  });
});

describe('CollabOpsTab — số liệu tức thời', () => {
  it('4 thẻ: tổng kết nối, tài liệu đang mở, bảng trắng đang mở, state chờ lưu', async () => {
    renderTab();

    await waitFor(() => expect(card('Kết nối đang mở')).toHaveTextContent('12'));
    expect(card('Tài liệu đang mở')).toHaveTextContent('4');
    expect(card('Bảng trắng đang mở')).toHaveTextContent('1');
    expect(card('State chờ lưu')).toHaveTextContent('2');
  });

  it('dịch vụ không phản hồi (live: null) hoặc tải lỗi → "—", KHÔNG phải 0', async () => {
    stats = { enabled: true, live: null };
    const first = renderTab();
    await waitFor(() => expect(card('Kết nối đang mở')).toHaveTextContent('—'));
    for (const label of ['Tài liệu đang mở', 'Bảng trắng đang mở', 'State chờ lưu']) {
      expect(card(label)).toHaveTextContent('—');
    }
    first.unmount();

    stats = 'error';
    renderTab();
    await waitFor(() => expect(card('Kết nối đang mở')).toHaveTextContent('—'));
    expect(card('Kết nối đang mở')).not.toHaveTextContent(/^0$/);
  });

  it('số 0 THẬT (dịch vụ chạy, chưa ai mở) vẫn hiện 0', async () => {
    stats = { enabled: true, live: { connections: {}, documents: {}, pendingStates: 0 } };
    renderTab();

    await waitFor(() => expect(card('Kết nối đang mở')).toHaveTextContent('0'));
    expect(card('Kết nối đang mở')).not.toHaveTextContent('—');
  });
});

describe('CollabOpsTab — tài liệu lớn (riêng tư)', () => {
  it('gọi đúng limit 20; hiện tiêu đề tài liệu nhóm, "Tài liệu riêng tư" cho PRIVATE, dung lượng, số bản lưu', async () => {
    renderTab();

    expect(await screen.findByText('Kế hoạch quý 4')).toBeInTheDocument();
    expect(largeLimits[0]).toBe('20');
    expect(screen.getByText('Tài liệu riêng tư')).toBeInTheDocument();
    expect(screen.getByText('Nhóm Beta')).toBeInTheDocument();
    expect(screen.getByText('3 MB')).toBeInTheDocument();
    expect(screen.getByText('Đã lưu trữ')).toBeInTheDocument();
  });

  it('BE LỠ trả tiêu đề của tài liệu PRIVATE → KHÔNG được in lên màn hình', async () => {
    large = [
      {
        ...LARGE_DOCS[1]!,
        title: 'Lương giám đốc — TUYỆT MẬT',
        visibility: 'PRIVATE',
      },
    ];
    renderTab();

    expect(await screen.findByText('Tài liệu riêng tư')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('TUYỆT MẬT');
    expect(document.body.textContent).not.toContain('Lương giám đốc');
  });

  it('tải lỗi → Callout, KHÔNG vẽ bảng "Chưa có tài liệu nào"', async () => {
    large = 'error';
    renderTab();

    expect(await screen.findByText('Không tải được danh sách tài liệu lớn')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có tài liệu nào')).not.toBeInTheDocument();
  });

  it('danh sách rỗng THẬT → "Chưa có tài liệu nào"', async () => {
    large = [];
    renderTab();

    expect(await screen.findByText('Chưa có tài liệu nào')).toBeInTheDocument();
  });
});

describe('CollabOpsTab — dọn bản lưu tự động', () => {
  it('chỉ integration:view → KHÔNG có nút dọn', async () => {
    renderTab();

    await screen.findByText('Hoạt động');
    expect(screen.queryByRole('button', { name: 'Chạy dọn bản lưu tự động ngay' })).not.toBeInTheDocument();
  });

  it('có system-config:update → mở hộp thoại; lý do ngắn bị chặn, đủ dài mới gửi POST { reason }', async () => {
    signIn(['integration:view', 'system-config:update']);
    renderTab();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Chạy dọn bản lưu tự động ngay' }));
    expect(await screen.findByText(/bản lưu thủ công của người dùng không bị ảnh hưởng/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Lý do/), 'ngắn');
    await user.click(screen.getByRole('button', { name: 'Chạy dọn' }));
    expect(await screen.findByText(/Lý do tối thiểu 10 ký tự/)).toBeInTheDocument();
    expect(cleanupBodies).toHaveLength(0);

    await user.clear(screen.getByLabelText(/Lý do/));
    await user.type(screen.getByLabelText(/Lý do/), 'Giải phóng dung lượng sau đợt import lớn');
    await user.click(screen.getByRole('button', { name: 'Chạy dọn' }));

    await waitFor(() =>
      expect(cleanupBodies).toEqual([{ reason: 'Giải phóng dung lượng sau đợt import lớn' }]),
    );
  });
});

describe('formatUptime', () => {
  it('rút gọn theo độ lớn', () => {
    expect(formatUptime(30)).toBe('30 giây');
    expect(formatUptime(42 * 60)).toBe('42 phút');
    expect(formatUptime(5 * 3600 + 12 * 60)).toBe('5 giờ 12 phút');
    expect(formatUptime(2 * 86400)).toBe('2 ngày');
    expect(formatUptime(3 * 86400 + 4 * 3600)).toBe('3 ngày 4 giờ');
  });

  it('thiếu/không hợp lệ → "—"', () => {
    expect(formatUptime(undefined)).toBe('—');
    expect(formatUptime(null)).toBe('—');
    expect(formatUptime(-1)).toBe('—');
    expect(formatUptime(Number.NaN)).toBe('—');
  });
});
