import type { InfiniteData } from '@tanstack/react-query';

import type { AnnouncementView, ReceiptsPage } from '../api/announcements.types';

type AnnouncementList = AnnouncementView[] | undefined;
type ReceiptsData = InfiniteData<ReceiptsPage> | undefined;

/**
 * Các hàm THUẦN vá cache danh sách theo kênh / danh sách xác nhận — dùng chung cho mutation lạc quan và socket. Không có
 * dòng cần vá thì trả về CHÍNH mảng cũ (React Query bỏ qua `setQueryData` khi tham chiếu không đổi ⇒ không vẽ lại thừa).
 */
export function hasAnnouncement(list: AnnouncementList, messageId: string): boolean {
  return list?.some((item) => item.messageId === messageId) ?? false;
}

export function patchAnnouncement(
  list: AnnouncementList,
  messageId: string,
  patch: Partial<AnnouncementView>,
): AnnouncementList {
  if (!hasAnnouncement(list, messageId)) return list;
  return list?.map((item) => (item.messageId === messageId ? { ...item, ...patch } : item));
}

export function removeAnnouncement(list: AnnouncementList, messageId: string): AnnouncementList {
  if (!hasAnnouncement(list, messageId)) return list;
  return list?.filter((item) => item.messageId !== messageId);
}

export function upsertAnnouncement(
  list: AnnouncementList,
  view: AnnouncementView,
): AnnouncementList {
  if (!list) return [view];
  if (!hasAnnouncement(list, view.messageId)) return [...list, view];
  return list.map((item) => (item.messageId === view.messageId ? view : item));
}

/** `confirmedCount` nằm ở `meta` của MỌI trang và cả hai tab — vá hết để "12/40" không lệch giữa các tab. */
export function patchReceiptsCount(data: ReceiptsData, confirmedCount: number): ReceiptsData {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, meta: { ...page.meta, confirmedCount } })),
  };
}
