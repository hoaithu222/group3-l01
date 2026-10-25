/**
 * `useOverview` + `useOpsStatsSocket` (p0-03): 2 số `realtime` của `GET /admin/overview` cập nhật qua sự kiện
 * `ops:stats` của phòng `admin:ops` (vá thẳng vào cache, KHÔNG refetch); chỉ poll REST khi chưa vào được phòng.
 * Socket giả dùng chung với các bài kiểm `moderation` (`fake-socket.ts`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import type { AdminOverview } from '@/core/api/admin';
import { SocketEvent } from '@/core/socket';
import { OVERVIEW_KEY } from '@/features/dashboard';
import { applyOpsStats } from '@/features/dashboard/hooks';
import { useOverview } from '@/features/dashboard/service/overview.queries';

import { emitFromServer, fakeSocket, joinPayloads, setAck } from '../moderation/fake-socket';

vi.mock('socket.io-client', async () => {
  const { fakeSocket: socket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => socket) };
});

const overview = (socketConnections: number, onlineUsers: number): AdminOverview => ({
  activeUsersSeries: [],
  activeWorkspaces: 3,
  failedAiJobs24h: 0,
  newUsers7d: 12,
  openReports: 1,
  realtime: { onlineUsers, socketConnections },
});

let restRequests = 0;
const server = setupServer(
  http.get('*/admin/overview', () => {
    restRequests += 1;
    return HttpResponse.json({ success: true, data: overview(42, 7) });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

function signIn(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  // Vai KHÔNG phải `admin` — `admin` vượt mọi kiểm quyền chi tiết nên sẽ che lỗi phân quyền.
  useAuthStore.getState().setAuth({
    user: { id: 'ops1', email: 'ops@congty.vn', name: 'Vận hành', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useOverview(), { wrapper }) };
}

describe('ops:stats → KPI realtime của dashboard', () => {
  beforeEach(() => {
    restRequests = 0;
    fakeSocket.emit.mockClear();
    setAck({ ok: true });
  });
  afterEach(() => server.resetHandlers());

  it('có dashboard:view → vào phòng admin:ops', async () => {
    signIn(['dashboard:view']);
    setup();

    await waitFor(() => expect(joinPayloads()).toContainEqual({ kind: 'admin', id: 'ops' }));
  });

  it('thiếu dashboard:view → KHÔNG room:join (tránh ack denied vô ích)', async () => {
    signIn(['user:view']);
    const { result } = setup();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(joinPayloads()).not.toContainEqual({ kind: 'admin', id: 'ops' });
  });

  it('nhận ops:stats → 2 số realtime đổi ngay, các số khác giữ nguyên, KHÔNG gọi lại REST', async () => {
    signIn(['dashboard:view']);
    const { result } = setup();
    await waitFor(() => expect(result.current.data?.realtime.socketConnections).toBe(42));
    expect(restRequests).toBe(1);

    act(() =>
      emitFromServer(SocketEvent.OPS_STATS, {
        v: 1,
        socketConnections: 99,
        onlineUsers: 55,
        serverNow: '2026-09-26T15:00:00.000Z',
      }),
    );

    await waitFor(() =>
      expect(result.current.data?.realtime).toEqual({ socketConnections: 99, onlineUsers: 55 }),
    );
    expect(result.current.data?.newUsers7d).toBe(12);
    expect(result.current.data?.activeWorkspaces).toBe(3);
    expect(restRequests).toBe(1);
  });

  // Đồng hồ giả PHẢI bật TRƯỚC khi dựng hook: `refetchInterval` của React Query tạo `setInterval` ngay lúc có dữ liệu — bật sau
  // thì interval nằm ở đồng hồ THẬT và `advanceTimersByTimeAsync` không bao giờ chạm tới (bài kiểm xanh giả).
  describe('polling dự phòng', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('phòng đã vào → KHÔNG poll REST định kỳ (không còn refetchInterval)', async () => {
      signIn(['dashboard:view']);
      const { result } = setup();
      await waitFor(() => expect(result.current.data).toBeDefined());
      await waitFor(() => expect(joinPayloads()).toHaveLength(1));
      await waitFor(() => expect(restRequests).toBe(1));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(95_000);
      });

      expect(restRequests).toBe(1);
    });

    it('phòng bị từ chối (ack denied) → poll dự phòng 30 s để số không đứng yên', async () => {
      setAck({ ok: false, code: 'PERM_006' });
      signIn(['dashboard:view']);
      const { result } = setup();
      await waitFor(() => expect(result.current.data).toBeDefined());
      await waitFor(() => expect(joinPayloads()).toHaveLength(1));
      expect(restRequests).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });

      await waitFor(() => expect(restRequests).toBeGreaterThanOrEqual(2));
    });
  });
});

describe('applyOpsStats', () => {
  it('chưa có dữ liệu overview → bỏ qua, không tạo cache rỗng', () => {
    const queryClient = new QueryClient();
    applyOpsStats(queryClient, { socketConnections: 5, onlineUsers: 2 });
    expect(queryClient.getQueryData(OVERVIEW_KEY)).toBeUndefined();
  });

  it('payload sai dạng (không phải số / âm) → giữ nguyên số cũ, không ghi NaN lên thẻ KPI', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(OVERVIEW_KEY, overview(42, 7));

    applyOpsStats(queryClient, { socketConnections: '9' as unknown as number, onlineUsers: 1 });
    applyOpsStats(queryClient, { socketConnections: 9, onlineUsers: -1 });
    applyOpsStats(queryClient, undefined as unknown as { socketConnections: number; onlineUsers: number });

    expect(queryClient.getQueryData<AdminOverview>(OVERVIEW_KEY)?.realtime).toEqual({
      socketConnections: 42,
      onlineUsers: 7,
    });
  });
});
