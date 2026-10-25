/**
 * Đồ dùng chung cho các bài kiểm tab `recordings` của workspace (p2-06 admin.md §2, §4): fixture theo ĐÚNG hợp đồng `AdminRecordingRow` /
 * `AdminRecordingDetail` / `AdminRecordingSummary` (chỉ metadata vận hành) và hàm đăng nhập/dựng MSW.
 *
 * Tệp `.tsx` không phải `*.test.*` nên vitest không chạy nó như bài kiểm.
 */
import { http } from 'msw';
import type { setupServer } from 'msw/node';

import { useAuthStore } from '@/app/store';
import type {
  AdminRecordingDetail,
  AdminRecordingRow,
  AdminRecordingSummary,
} from '@/features/workspace/types/workspace-recordings.types';

import { errorBody, okBody, pageMeta } from './meetings-fixtures';

export { errorBody, okBody, pageMeta, renderTabAt, urlParam } from './meetings-fixtures';

export const MB = 1024 * 1024;
export const GB = 1024 * MB;

export function makeRecording(over: Partial<AdminRecordingRow> = {}): AdminRecordingRow {
  return {
    id: 'r-ready',
    meeting: { id: 'm1', title: 'Họp tuần sản phẩm' },
    workspace: { id: 'ws-1', name: 'Nhóm Alpha' },
    startedBy: { id: 'u1', name: 'An Nguyễn' },
    status: 'READY',
    layout: 'GRID',
    startedAt: '2026-10-05T02:00:00.000Z',
    stoppedAt: '2026-10-05T03:05:00.000Z',
    durationSec: 3900,
    fileSizeBytes: 700 * MB,
    retentionExpiresAt: '2027-01-03T03:05:00.000Z',
    retentionDaysLeft: 80,
    deletedAt: null,
    deleteReason: null,
    error: null,
    ...over,
  };
}

/** Sáu trạng thái vòng đời + một bản đã xoá — mỗi bản một tiêu đề riêng để tìm hàng. */
export const RECORDING_ROWS: AdminRecordingRow[] = [
  makeRecording({
    id: 'r-starting',
    status: 'STARTING',
    meeting: { id: 'm-a', title: 'Họp khởi động' },
    durationSec: null,
    fileSizeBytes: null,
    stoppedAt: null,
    retentionExpiresAt: null,
    retentionDaysLeft: null,
  }),
  makeRecording({
    id: 'r-recording',
    status: 'RECORDING',
    meeting: { id: 'm-b', title: 'Họp đang ghi' },
    durationSec: null,
    fileSizeBytes: null,
    stoppedAt: null,
    retentionExpiresAt: null,
    retentionDaysLeft: null,
  }),
  makeRecording({
    id: 'r-stopping',
    status: 'STOPPING',
    meeting: { id: 'm-c', title: 'Họp đang dừng' },
    durationSec: 1200,
    fileSizeBytes: null,
    retentionExpiresAt: null,
    retentionDaysLeft: null,
  }),
  makeRecording({
    id: 'r-processing',
    status: 'PROCESSING',
    meeting: { id: 'm-d', title: 'Họp đang xử lý' },
    durationSec: 1800,
    fileSizeBytes: null,
    retentionExpiresAt: null,
    retentionDaysLeft: null,
  }),
  makeRecording({ id: 'r-ready', status: 'READY' }),
  makeRecording({
    id: 'r-failed',
    status: 'FAILED',
    meeting: { id: 'm-e', title: 'Họp bị lỗi' },
    durationSec: 300,
    fileSizeBytes: null,
    retentionExpiresAt: null,
    retentionDaysLeft: null,
    error: 'Egress dừng đột ngột (mã lỗi đã làm sạch)',
  }),
  makeRecording({
    id: 'r-deleted',
    status: 'READY',
    meeting: { id: 'm-f', title: 'Họp đã xoá bản ghi' },
    deletedAt: '2026-10-20T00:00:00.000Z',
    deleteReason: 'Yêu cầu của chủ trì',
    retentionExpiresAt: null,
    retentionDaysLeft: null,
  }),
];

export function makeDetail(over: Partial<AdminRecordingDetail> = {}): AdminRecordingDetail {
  return {
    ...makeRecording(),
    callId: 'call-1',
    egressId: 'EG_abc123',
    stoppedBy: { id: 'u1', name: 'An Nguyễn' },
    stopReason: 'HOST_STOPPED',
    consentCount: 3,
    storageKeyMasked: 'recordings/…/r-ready.mp4',
    object: { exists: true, sizeBytes: 700 * MB },
    ...over,
  };
}

export const SUMMARY: AdminRecordingSummary = {
  recordingStorageBytes: 5 * GB,
  storageBytes30dAgo: 4 * GB,
  readyCount: 12,
  expiringIn7d: 2,
  failed24h: 1,
};

/** Đăng nhập theo QUYỀN (không dùng vai trò `admin`: SUPER_ROLE bỏ qua kiểm quyền nên test không phân biệt được có/không có `workspace:delete`). */
export function signIn(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Quản trị', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

export interface ListCall {
  path: string;
  q: URLSearchParams;
}

/** Danh sách + tóm tắt + chi tiết; ghi lại mọi lần gọi danh sách. `rows` mặc định là bảy bản ghi ở trên. */
export function mockRecordings(
  server: ReturnType<typeof setupServer>,
  rows: AdminRecordingRow[] = RECORDING_ROWS,
  summary: AdminRecordingSummary = SUMMARY,
) {
  const calls: ListCall[] = [];
  const summaryCalls: URLSearchParams[] = [];
  server.use(
    http.get('*/admin/recordings/summary', ({ request }) => {
      summaryCalls.push(new URL(request.url).searchParams);
      return okBody(summary);
    }),
    http.get('*/admin/recordings/:id', ({ params }) => {
      const row = rows.find((r) => r.id === params.id);
      return row
        ? okBody(makeDetail({ ...row, storageKeyMasked: `recordings/…/${row.id}.mp4` }))
        : errorBody(404, 'REC_005', 'Bản ghi không còn khả dụng');
    }),
    http.get('*/admin/recordings', ({ request }) => {
      const u = new URL(request.url);
      calls.push({ path: u.pathname, q: u.searchParams });
      return okBody(
        rows,
        pageMeta(
          rows.length,
          Number(u.searchParams.get('page') ?? 1),
          Number(u.searchParams.get('limit') ?? 20),
        ),
      );
    }),
  );
  return { calls, summaryCalls };
}
