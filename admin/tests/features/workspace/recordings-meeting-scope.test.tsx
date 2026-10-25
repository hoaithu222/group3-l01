/**
 * Ghi hình lọc theo MỘT cuộc họp (`GET /admin/recordings?meetingId=` — BE đã hỗ trợ): `WorkspaceRecordingsTab` nhận `meetingId`, tab "Ghi hình"
 * toàn nền tảng (`features/meeting`) đọc `?meetingId=` từ URL kèm chip "Bỏ lọc cuộc họp", và ngăn kéo/cột "Ghi hình" của bảng cuộc họp trỏ tới đó.
 * Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import MeetingDrawerBody from '@/features/meeting/components/meetings/MeetingDrawerBody';
import { buildMeetingColumns } from '@/features/meeting/components/meetings/meetings-table.columns';
import RecordingsTab from '@/features/meeting/components/recordings/RecordingsTab';
import type { AdminMeetingDetail, AdminMeetingRow } from '@/features/meeting/types/meeting.types';
import WorkspaceRecordingsTab from '@/features/workspace/components/tabs/WorkspaceRecordingsTab';

import {
  mockRecordings,
  okBody,
  RECORDING_ROWS,
  renderTabAt,
  signIn,
  urlParam,
} from './recordings-fixtures';

const MEETING_ID = '665f1c2e8a1b2c3d4e5f6a7b';
const WS_ID = '665f1c2e8a1b2c3d4e5f6a01';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
// Chỉ `meeting:view` (không `workspace:view`): ô lọc workspace không render nên không cần mock `/admin/workspaces`.
beforeEach(() => signIn(['meeting:view']));

describe('WorkspaceRecordingsTab — meetingId', () => {
  it('có meetingId hợp lệ → gửi meetingId, KHÔNG gọi/hiện thẻ tóm tắt (BE chỉ tóm tắt theo workspace, sẽ nói số của cả nhóm)', async () => {
    const { calls, summaryCalls } = mockRecordings(server);
    renderTabAt(<WorkspaceRecordingsTab meetingId={MEETING_ID} workspaceId={WS_ID} />, '/x?a=1');

    await screen.findByText('Họp tuần sản phẩm');
    expect(calls[0]!.q.get('meetingId')).toBe(MEETING_ID);
    expect(calls[0]!.q.get('workspaceId')).toBe(WS_ID);
    expect(summaryCalls).toHaveLength(0);
    expect(screen.queryByText('Tổng quan ghi hình')).not.toBeInTheDocument();
  });

  it('meetingId sai dạng (URL bị sửa tay) → KHÔNG gửi lên BE (tránh 400) và thẻ tóm tắt vẫn hiện', async () => {
    const { calls, summaryCalls } = mockRecordings(server);
    renderTabAt(<WorkspaceRecordingsTab meetingId="khong-phai-objectid" workspaceId={WS_ID} />, '/x');

    await screen.findByText('Họp tuần sản phẩm');
    expect(calls[0]!.q.has('meetingId')).toBe(false);
    await waitFor(() => expect(summaryCalls).toHaveLength(1));
    expect(screen.getByText('Tổng quan ghi hình')).toBeInTheDocument();
  });

  it('không có meetingId → hành vi cũ: không gửi meetingId, có thẻ tóm tắt', async () => {
    const { calls, summaryCalls } = mockRecordings(server);
    renderTabAt(<WorkspaceRecordingsTab workspaceId={WS_ID} />, '/x');

    await screen.findByText('Họp tuần sản phẩm');
    expect(calls[0]!.q.has('meetingId')).toBe(false);
    await waitFor(() => expect(summaryCalls).toHaveLength(1));
  });
});

describe('tab "Ghi hình" toàn nền tảng — ?meetingId=', () => {
  it('đọc meetingId từ URL: gọi API có meetingId, hiện chip; "Bỏ lọc cuộc họp" xoá khoá khỏi URL và gọi lại không lọc', async () => {
    const { calls } = mockRecordings(server);
    const { router } = renderTabAt(
      <RecordingsTab />,
      `/meeting?tab=recordings&workspaceId=${WS_ID}&meetingId=${MEETING_ID}`,
    );

    await screen.findByText('Họp tuần sản phẩm');
    expect(screen.getByText('Chỉ bản ghi của một cuộc họp')).toBeInTheDocument();
    expect(calls[0]!.q.get('meetingId')).toBe(MEETING_ID);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Bỏ lọc cuộc họp' }));

    await waitFor(() => expect(urlParam(router, 'meetingId')).toBeNull());
    expect(urlParam(router, 'tab')).toBe('recordings');
    expect(urlParam(router, 'workspaceId')).toBe(WS_ID);
    await waitFor(() => expect(calls.at(-1)!.q.has('meetingId')).toBe(false));
    expect(screen.queryByText('Chỉ bản ghi của một cuộc họp')).not.toBeInTheDocument();
  });

  it('không có meetingId → không có chip lọc cuộc họp', async () => {
    mockRecordings(server);
    renderTabAt(<RecordingsTab />, `/meeting?tab=recordings&workspaceId=${WS_ID}`);

    await screen.findByText('Họp tuần sản phẩm');
    expect(screen.queryByText('Chỉ bản ghi của một cuộc họp')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bỏ lọc cuộc họp' })).not.toBeInTheDocument();
  });

  it('meetingId sai dạng → coi như không lọc: không chip, không gửi lên BE', async () => {
    const { calls } = mockRecordings(server, RECORDING_ROWS);
    renderTabAt(<RecordingsTab />, '/meeting?tab=recordings&meetingId=abc');

    await screen.findByText('Họp tuần sản phẩm');
    expect(screen.queryByText('Chỉ bản ghi của một cuộc họp')).not.toBeInTheDocument();
    expect(calls[0]!.q.has('meetingId')).toBe(false);
  });
});

const makeRow = (recordingCount: number): AdminMeetingRow => ({
  id: MEETING_ID,
  code: 'abc-defg-hij',
  title: 'Họp tuần',
  workspace: { id: WS_ID, name: 'Nhóm Alpha' },
  host: { id: 'u1', name: 'An Nguyễn' },
  startAt: '2026-10-05T02:00:00.000Z',
  endAt: '2026-10-05T03:00:00.000Z',
  timezone: 'Asia/Ho_Chi_Minh',
  status: 'ENDED',
  platform: 'INTERNAL',
  attendeeCount: 4,
  sessionCount: 1,
  totalDurationSec: 3600,
  recordingCount,
});

/** Đường dẫn + tham số của liên kết; gốc giả để `new URL` chịu đường dẫn tương đối. */
const parseHref = (el: HTMLElement) => {
  const url = new URL(el.getAttribute('href')!, 'http://x');
  return { path: url.pathname, query: Object.fromEntries(url.searchParams) };
};

describe('cột "Ghi hình" của bảng cuộc họp', () => {
  const renderCell = (meeting: AdminMeetingRow) => {
    const column = buildMeetingColumns({
      hrefFor: () => '/meeting',
      onOpen: () => undefined,
      canForceEnd: false,
      onForceEnd: () => undefined,
    }).find((c) => c.key === 'recordingCount')!;
    render(<MemoryRouter>{column.cell!(meeting, 0)}</MemoryRouter>);
  };

  it('có bản ghi → số là liên kết tới tab Ghi hình đã lọc theo workspace + cuộc họp', () => {
    renderCell(makeRow(3));

    expect(parseHref(screen.getByRole('link', { name: '3' }))).toEqual({
      path: '/meeting',
      query: { tab: 'recordings', workspaceId: WS_ID, meetingId: MEETING_ID },
    });
  });

  it('0 bản ghi → chỉ là số, không có liên kết', () => {
    renderCell(makeRow(0));

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('ngăn kéo cuộc họp — khối "Ghi hình"', () => {
  const detail = (ready: number, failed: number): AdminMeetingDetail => ({
    ...makeRow(ready + failed),
    sessions: [],
    recordings: { ready, failed, totalBytes: 1024 },
  });

  const renderBody = (meeting: AdminMeetingDetail) => {
    server.use(
      http.get('*/capabilities', () => okBody({ features: { voice: { enabled: true, available: true } } })),
      http.get('*/audit-logs', () => okBody([], { nextCursor: null, hasMore: false, limit: 20 })),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <MeetingDrawerBody canForceEnd={false} meeting={meeting} onForceEnd={() => undefined} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('có bản ghi → liên kết "Xem ghi hình của cuộc họp" mang cả workspaceId và meetingId', () => {
    renderBody(detail(2, 1));

    expect(parseHref(screen.getByRole('link', { name: 'Xem ghi hình của cuộc họp' }))).toEqual({
      path: '/meeting',
      query: { tab: 'recordings', workspaceId: WS_ID, meetingId: MEETING_ID },
    });
  });

  it('chưa có bản ghi nào → không có liên kết', () => {
    renderBody(detail(0, 0));

    expect(screen.queryByRole('link', { name: 'Xem ghi hình của cuộc họp' })).not.toBeInTheDocument();
  });
});
