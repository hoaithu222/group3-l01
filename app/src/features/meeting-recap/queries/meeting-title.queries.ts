import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

/**
 * Tiêu đề cuộc họp cho thanh tiêu đề của biên bản/bản ghi. Gọi THẲNG `GET /meetings/:id` bằng khoá RIÊNG (không đụng khoá chi tiết của
 * `features/meetings` — bên đó đóng dấu `receivedAt` cho đồng hồ theo giờ server; ghi hình dạng khác vào cùng khoá là làm lệch đồng hồ).
 * Không import `meetings` (không import chéo feature). Lỗi → không có tiêu đề (màn vẫn chạy).
 */
export function useMeetingTitle(meetingId: string | undefined): string | undefined {
  const query = useQuery({
    enabled: Boolean(meetingId),
    queryFn: async () => unwrapData<{ title: string }>(await apiClient.get(`/meetings/${meetingId ?? ''}`, { skipErrorToast: true })),
    queryKey: ['meetings', 'recap-title', meetingId ?? ''],
    retry: false,
    select: (data) => data.title,
    staleTime: 5 * 60_000,
  });
  return query.data;
}
