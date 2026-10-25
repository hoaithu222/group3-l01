import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { announcementKeys } from '../api/announcements.keys';
import { announcementsService } from '../api/announcements.service';
import type { AnnouncementView } from '../api/announcements.types';

/**
 * Yêu cầu xác nhận chưa huỷ của MỘT kênh (≤ 50) — nguồn DUY NHẤT của huy hiệu trên tin. Chỉ `AnnouncementHost` (một cái
 * mỗi phòng chat) gọi hook này để TẢI; các bong bóng chỉ ĐỌC cache qua `useAnnouncement` ⇒ không N+1.
 *
 * `staleTime: 0` (thay vì mặc định 60 s của app): sự kiện `announcement:updated` chỉ tới khi đang ở trong phòng `ch:{id}`, nên
 * yêu cầu tạo/huỷ LÚC RỜI kênh phải được bù bằng một lượt tải mỗi lần vào lại — rẻ (một GET, ≤ 50 dòng) mà bảo đảm huy hiệu đúng.
 */
export function useChannelAnnouncements(channelId: string) {
  return useQuery({
    queryKey: announcementKeys.channel(channelId),
    queryFn: () => announcementsService.listByChannel(channelId),
    staleTime: 0,
    retry: false,
  });
}

/**
 * Trạng thái yêu cầu của MỘT tin, đọc từ cache danh sách của kênh — KHÔNG tự tải (`enabled: false`): nếu mỗi bong bóng
 * là một observer đang bật thì mỗi lần FlashList tái chế dòng lại có thể kích hoạt một lượt tải. `select` + structural
 * sharing giữ nguyên tham chiếu khi dòng của tin này không đổi ⇒ chỉ đúng bong bóng liên quan vẽ lại.
 *
 * `undefined` = tin không có yêu cầu (hoặc đã huỷ, hoặc danh sách chưa tải / cờ `readConfirm` tắt).
 */
export function useAnnouncement(
  channelId: string,
  messageId: string,
): AnnouncementView | undefined {
  const select = useCallback(
    (list: AnnouncementView[]) => list.find((item) => item.messageId === messageId),
    [messageId],
  );
  return useQuery({
    queryKey: announcementKeys.channel(channelId),
    queryFn: () => announcementsService.listByChannel(channelId),
    enabled: false,
    select,
  }).data;
}
