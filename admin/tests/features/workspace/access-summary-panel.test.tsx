/**
 * Khối "Truy cập nhóm" của tab Tổng quan và gợi ý "trong đó N kênh có cấp theo vai trò" của tab Kênh
 * (p3-04 admin.md §1, §4). Mock ở tầng HTTP (MSW).
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import AccessSummaryPanel from '@/features/workspace/components/AccessSummaryPanel';
import WorkspaceChannelsTab from '@/features/workspace/components/tabs/WorkspaceChannelsTab';

import {
  ACCESS_SUMMARY,
  errorBody,
  okBody,
  renderWithQuery,
  renderWithRouter,
  signIn,
} from './p3-fixtures';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['workspace:view']));

const summary = (over: Record<string, unknown> = {}) => ({ ...ACCESS_SUMMARY, ...over });
const useSummary = (data: unknown) =>
  server.use(http.get('*/admin/workspaces/:id/access-summary', () => okBody(data)));

describe('AccessSummaryPanel', () => {
  it('hiện chính sách tham gia, chính sách khách, số khách đang hoạt động (kèm sắp hết hạn) và việc chờ xử lý', async () => {
    useSummary(summary());
    renderWithQuery(<AccessSummaryPanel workspaceId="ws-1" />);

    expect(await screen.findByText('Truy cập nhóm')).toBeInTheDocument();
    expect(await screen.findByText('Cần duyệt')).toBeInTheDocument();
    expect(screen.getByText('Bật (tối đa 20 khách, ≤ 90 ngày)')).toBeInTheDocument();
    expect(screen.getByText('1 khách sắp hết hạn trong 48 giờ')).toBeInTheDocument();
    expect(screen.getByText(/2 yêu cầu tham gia/)).toBeInTheDocument();
    expect(screen.getByText(/5 lời mời/)).toBeInTheDocument();
  });

  it('tham gia tự do + khách tắt + không khách sắp hết hạn', async () => {
    useSummary(
      summary({
        joinPolicy: 'OPEN',
        guestPolicy: { enabled: false, maxGuests: 20, maxDays: 90 },
        guests: { active: 0, expiringIn48h: 0 },
      }),
    );
    renderWithQuery(<AccessSummaryPanel workspaceId="ws-1" />);

    expect(await screen.findByText('Tự do')).toBeInTheDocument();
    expect(screen.getByText('Tắt')).toBeInTheDocument();
    expect(screen.queryByText(/sắp hết hạn/)).not.toBeInTheDocument();
  });

  it('lỗi tải: báo lỗi có "Thử lại", bấm là tải lại thành công', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/workspaces/:id/access-summary', () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_500', 'Lỗi hệ thống') : okBody(summary());
      }),
    );
    renderWithQuery(<AccessSummaryPanel workspaceId="ws-1" />);

    expect(await screen.findByText('Không tải được thông tin truy cập')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Cần duyệt')).toBeInTheDocument();
  });
});

const CHANNELS = {
  public: [
    {
      id: 'c-1',
      name: 'chung',
      type: 'TEXT',
      postingPolicy: 'MEMBERS',
      status: 'ACTIVE',
      isDefault: true,
      archiveReason: null,
      memberCount: 8,
      messages7d: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  privateCount: 6,
  privateArchivedCount: 0,
  meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
  // Kênh riêng tư mà BE KHÔNG được trả (lỡ trả thì UI cũng không được in).
  private: [{ id: 'c-9', name: 'ke-hoach-luong-bi-mat', memberCount: 3 }],
};

describe('WorkspaceChannelsTab — kênh riêng tư có cấp theo vai trò', () => {
  it('chỉ SỐ kênh riêng tư và "trong đó N kênh có cấp theo vai trò" — không tên kênh riêng tư', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/channels', () => okBody(CHANNELS)),
      http.get('*/admin/workspaces/:id/access-summary', () => okBody(summary())),
    );
    renderWithRouter(<WorkspaceChannelsTab workspaceId="ws-1" />);

    expect(await screen.findByText('trong đó 2 kênh có cấp theo vai trò')).toBeInTheDocument();
    const card = screen.getByText('Kênh riêng tư').parentElement as HTMLElement;
    expect(card).toHaveTextContent('6');

    // Kênh công khai hiện tên như cũ; tên kênh riêng tư (dù BE lỡ trả) không lên màn hình.
    expect(screen.getByText('chung')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('ke-hoach-luong-bi-mat');
  });

  it('access-summary lỗi ⇒ tab kênh vẫn chạy, chỉ thiếu dòng phụ', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/channels', () => okBody(CHANNELS)),
      http.get('*/admin/workspaces/:id/access-summary', () => errorBody(404, 'RES_001', 'Không tìm thấy')),
    );
    renderWithRouter(<WorkspaceChannelsTab workspaceId="ws-1" />);

    expect(await screen.findByText('chung')).toBeInTheDocument();
    expect(screen.queryByText(/kênh có cấp theo vai trò/)).not.toBeInTheDocument();
  });
});
