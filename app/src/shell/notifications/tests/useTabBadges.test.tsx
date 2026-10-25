import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { notificationKeys, readStateService, type UnreadSummary } from '@/core/notifications';
import { MODULE_REGISTRY } from '@/shell/navigation/module-registry';

import { useTabBadges } from '../useTabBadges';
import { useUnreadSummary } from '../useUnreadSummary';

/**
 * Nguồn số huy hiệu tab (p1-07 `app.md` §1): `GET /me/unread/summary` → theo `badge` của `MODULE_REGISTRY`, khoá theo
 * TÊN route (`AppTabBar` tra bằng `route.name`). Hỏng ở đây = tab hiện số của tab khác mà không lỗi nào báo.
 */

const SUMMARY: UnreadSummary = {
  activity: { mentions: 1, unread: 5 },
  badgeTotal: 12,
  computedAt: '2026-09-21T00:00:00.000Z',
  conversations: { mentions: 0, unreadConversations: 3, unreadMessages: 20 },
  workspaces: [
    { mentions: 0, unreadChannels: 2, workspaceId: 'ws-1' },
    { mentions: 1, unreadChannels: 1, workspaceId: 'ws-2' },
  ],
};

// `useCapabilities` đặt gcTime 24 giờ → timer treo khiến Jest chạy đơn lẻ không thoát được; cờ phân hệ giả bằng `useFeature`.
let mockCommunication: boolean | undefined = true;
jest.mock('@/shell/capabilities', () => ({ useFeature: () => mockCommunication }));

const summarySpy = jest.spyOn(readStateService, 'getSummary');

function setup(communication: boolean | undefined) {
  mockCommunication = communication;
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

beforeEach(() => {
  summarySpy.mockReset().mockResolvedValue(SUMMARY);
});

describe('useTabBadges', () => {
  it('ánh xạ đúng nguồn số theo `badge` của từng tab, khoá theo tên route', async () => {
    const { wrapper } = setup(true);
    const { result } = await renderHook(() => useTabBadges(), { wrapper });

    await waitFor(() => expect(Object.keys(result.current).length).toBeGreaterThan(0));

    const nameOf = (badge: string) => MODULE_REGISTRY.find((m) => m.badge === badge)?.name ?? '';
    expect(result.current[nameOf('unreadConversations')]).toBe(3);
    expect(result.current[nameOf('unread')]).toBe(5);
    // Tab Nhóm: tổng số kênh chưa đọc ở MỌI nhóm làm việc.
    expect(result.current[nameOf('unreadChannels')]).toBe(3);
    // Tab không khai `badge` (Tôi, Học) không có số.
    expect(result.current['me']).toBeUndefined();
  });

  it('chưa có dữ liệu → không bịa số nào', async () => {
    summarySpy.mockReturnValue(new Promise(() => undefined));
    const { wrapper } = setup(true);
    const { result } = await renderHook(() => useTabBadges(), { wrapper });
    expect(result.current).toEqual({});
  });
});

describe('useUnreadSummary — điều kiện chạy', () => {
  it('phân hệ `communication` TẮT → không gọi API (route read-state gắn cờ, sẽ 404)', async () => {
    const { wrapper } = setup(false);
    await renderHook(() => useUnreadSummary(), { wrapper });
    expect(summarySpy).not.toHaveBeenCalled();
  });

  it('chưa biết cờ (đang tải capabilities) → vẫn chạy (fail-open như thanh tab), ghi vào khoá tóm tắt', async () => {
    const { queryClient, wrapper } = setup(undefined);
    await renderHook(() => useUnreadSummary(), { wrapper });
    await waitFor(() => expect(summarySpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(queryClient.getQueryData(notificationKeys.unreadSummary)).toEqual(SUMMARY),
    );
  });
});
