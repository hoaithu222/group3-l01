import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/app/store';
import { overviewService } from '@/core/api/admin';
import type { InsightsRange } from '@/core/api/admin';

import { INSIGHTS_POLL_MS } from '../constants/dashboard.constants';
import { insightsKey } from './insights.keys';

/**
 * Số liệu phân tích của trang Tổng quan (`GET /admin/overview/insights?range`) — chỉ tải sau khi đăng nhập.
 *
 * - `placeholderData: keepPreviousData`: đổi khoảng thời gian thì GIỮ hình cũ (`isPlaceholderData`) tới khi số mới về — không nháy trắng, không
 *   hiện số 0 giả. Màn dùng `isPlaceholderData` để làm mờ.
 * - `refetchInterval` 60 s = thời gian BE cache; mặc định React Query DỪNG poll khi tab ẩn (`refetchIntervalInBackground: false`) nên không
 *   tốn request cho tab không ai nhìn, và quay lại tab là `refetchOnWindowFocus` tải bù.
 */
export function useInsights(range: InsightsRange) {
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: insightsKey(range),
    queryFn: async () => (await overviewService.insights(range)).data,
    enabled: status === 'authenticated',
    placeholderData: keepPreviousData,
    refetchInterval: INSIGHTS_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: INSIGHTS_POLL_MS,
  });
}
