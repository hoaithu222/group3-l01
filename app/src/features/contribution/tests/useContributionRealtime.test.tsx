import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';

import { SocketEvent } from '@/core/socket';

import { useContributionRealtime } from '../hooks/useContributionRealtime';
import { contributionKeys } from '../queries/contribution.keys';
import { BOARD, USER_A } from './fixtures';

/**
 * Realtime của màn đóng góp (app.md §4): chỉ `board:updated` MANG `contributionChanged` mới làm mới công thức + báo cáo mọi kỳ + thẻ được tính (đổi tên bảng/nhãn
 * không đổi điểm); thông báo `contribution.export-*` làm mới lượt xuất đang theo dõi. Mock socket toàn cục (`__mocks__/socket.io-client.ts`).
 */
interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

const KEYS = {
  config: contributionKeys.config(BOARD),
  export: contributionKeys.export('e-1'),
  heatmap: contributionKeys.heatmap(BOARD, 'all', '2026-03-23', '2026-09-15'),
  memberTasks: contributionKeys.memberTasks(BOARD, USER_A, 'ALL'),
  reportAll: contributionKeys.report(BOARD, 'ALL'),
  reportMonth: contributionKeys.report(BOARD, 'M:2026-09'),
};

function setup(exportId?: string) {
  // `gcTime: Infinity`: dữ liệu gieo bằng `setQueryData` không có observer nào giữ — `gcTime: 0` sẽ dọn mất trước khi kiểm.
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  for (const key of Object.values(KEYS)) client.setQueryData(key, { seeded: true });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, exportId, wrapper };
}

const invalidated = (client: QueryClient, key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated === true;

async function emit(event: string, payload: unknown): Promise<void> {
  await act(async () => mockSocket.__emitServer(event, payload));
}

describe('useContributionRealtime — board:updated', () => {
  it('contributionChanged: làm mới công thức, báo cáo MỌI kỳ và thẻ được tính; biểu đồ hoạt động KHÔNG bị kéo theo', async () => {
    const { client, wrapper } = setup();
    await renderHook(() => useContributionRealtime(BOARD), { wrapper });

    await emit(SocketEvent.BOARD_UPDATED, { boardId: BOARD, contributionChanged: true, version: 5 });

    expect(invalidated(client, KEYS.config)).toBe(true);
    expect(invalidated(client, KEYS.reportAll)).toBe(true);
    expect(invalidated(client, KEYS.reportMonth)).toBe(true);
    expect(invalidated(client, KEYS.memberTasks)).toBe(true);
    expect(invalidated(client, KEYS.heatmap)).toBe(false);
  });

  it('board:updated không mang contributionChanged (đổi tên/nhãn) → không làm mới gì', async () => {
    const { client, wrapper } = setup();
    await renderHook(() => useContributionRealtime(BOARD), { wrapper });

    await emit(SocketEvent.BOARD_UPDATED, { boardId: BOARD, labelsChanged: true, version: 6 });

    expect(invalidated(client, KEYS.reportAll)).toBe(false);
    expect(invalidated(client, KEYS.config)).toBe(false);
  });

  it('sự kiện của BẢNG KHÁC → bỏ qua', async () => {
    const { client, wrapper } = setup();
    await renderHook(() => useContributionRealtime(BOARD), { wrapper });

    await emit(SocketEvent.BOARD_UPDATED, { boardId: 'b-khac', contributionChanged: true, version: 2 });

    expect(invalidated(client, KEYS.reportAll)).toBe(false);
  });
});

describe('useContributionRealtime — thông báo xuất PDF', () => {
  it('contribution.export-ready của đúng lượt đang theo dõi → làm mới trạng thái lượt đó', async () => {
    const { client, wrapper } = setup('e-1');
    await renderHook(() => useContributionRealtime(BOARD, 'e-1'), { wrapper });

    await emit(SocketEvent.NOTIFICATION_CREATED, { id: 'n1', kind: 'X', refs: { exportId: 'e-1' }, type: 'contribution.export-ready' });

    expect(invalidated(client, KEYS.export)).toBe(true);
  });

  it('lượt xuất KHÁC, loại thông báo khác, hoặc chưa theo dõi lượt nào → bỏ qua', async () => {
    const { client, wrapper } = setup('e-1');
    await renderHook(() => useContributionRealtime(BOARD, 'e-1'), { wrapper });

    await emit(SocketEvent.NOTIFICATION_CREATED, { id: 'n2', kind: 'X', refs: { exportId: 'e-khac' }, type: 'contribution.export-failed' });
    await emit(SocketEvent.NOTIFICATION_CREATED, { id: 'n3', kind: 'MENTION', refs: { exportId: 'e-1' }, type: 'mention' });
    expect(invalidated(client, KEYS.export)).toBe(false);

    const idle = setup();
    await renderHook(() => useContributionRealtime(BOARD), { wrapper: idle.wrapper });
    await emit(SocketEvent.NOTIFICATION_CREATED, { id: 'n4', kind: 'X', refs: { exportId: 'e-1' }, type: 'contribution.export-ready' });
    expect(invalidated(idle.client, KEYS.export)).toBe(false);
  });
});
