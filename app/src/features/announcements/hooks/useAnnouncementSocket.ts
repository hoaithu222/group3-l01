import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { onRoomResync, SocketEvent, useSocketEvent } from '@/core/socket';

import { announcementKeys } from '../api/announcements.keys';
import type {
  AnnouncementConfirmedPayload,
  AnnouncementUpdatedPayload,
  AnnouncementView,
  ReceiptsPage,
} from '../api/announcements.types';
import {
  hasAnnouncement,
  patchAnnouncement,
  patchReceiptsCount,
  removeAnnouncement,
} from '../utils/announcement-cache';

/** Một đợt xác nhận dồn dập (kênh vài trăm người) chỉ tải lại danh sách xác nhận MỘT lần sau khoảng lặng này. */
const RECEIPTS_REFRESH_MS = 500;

type AnnouncementList = AnnouncementView[] | undefined;

/**
 * Realtime cho yêu cầu xác nhận của MỘT kênh (p5-04 be.md §6):
 *  · `announcement:updated` `ch:{id}` — huỷ (`cancelled`/`required:false`) ⇒ gỡ dòng; tạo/khôi phục ⇒ tải lại danh sách
 *    (payload không có view đầy đủ: `confirmedByMe`/`canViewReceipts` là của TỪNG người).
 *  · `announcement:updated` `user:{id}` (`confirmedByMe:true`) — máy khác của mình vừa bấm ⇒ vá `confirmedByMe`.
 *  · `announcement:confirmed` `user:{người yêu cầu}` — vá `confirmedCount` ở danh sách lẫn `meta` của danh sách xác nhận,
 *    rồi (gộp 500 ms) tải lại danh sách người để dòng mới hiện ra.
 *  · rejoin phòng sau mất mạng (`onRoomResync`) ⇒ tải lại mọi thứ — sự kiện đã lỡ không phát lại.
 */
export function useAnnouncementSocket(channelId: string): void {
  const queryClient = useQueryClient();
  const listKey = announcementKeys.channel(channelId);
  const refreshTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const invalidateList = () => void queryClient.invalidateQueries({ queryKey: listKey });

  const scheduleReceiptsRefresh = (messageId: string) => {
    const timers = refreshTimers.current;
    clearTimeout(timers.get(messageId));
    timers.set(
      messageId,
      setTimeout(() => {
        timers.delete(messageId);
        void queryClient.invalidateQueries({ queryKey: announcementKeys.receiptsOf(messageId) });
      }, RECEIPTS_REFRESH_MS),
    );
  };

  useSocketEvent<AnnouncementUpdatedPayload>(SocketEvent.ANNOUNCEMENT_UPDATED, (payload) => {
    if (payload.channelId !== channelId) return;

    if (payload.cancelled === true || payload.required === false) {
      queryClient.setQueryData<AnnouncementList>(listKey, (list) =>
        removeAnnouncement(list, payload.messageId),
      );
      return;
    }
    if (payload.confirmedByMe === true) {
      const list = queryClient.getQueryData<AnnouncementList>(listKey);
      if (hasAnnouncement(list, payload.messageId)) {
        queryClient.setQueryData<AnnouncementList>(
          listKey,
          patchAnnouncement(list, payload.messageId, { confirmedByMe: true }),
        );
      } else {
        invalidateList();
      }
      return;
    }
    invalidateList();
  });

  useSocketEvent<AnnouncementConfirmedPayload>(SocketEvent.ANNOUNCEMENT_CONFIRMED, (payload) => {
    if (payload.channelId !== channelId) return;

    const list = queryClient.getQueryData<AnnouncementList>(listKey);
    if (hasAnnouncement(list, payload.messageId)) {
      queryClient.setQueryData<AnnouncementList>(
        listKey,
        patchAnnouncement(list, payload.messageId, { confirmedCount: payload.confirmedCount }),
      );
    } else {
      invalidateList();
    }
    queryClient.setQueriesData<InfiniteData<ReceiptsPage>>(
      { queryKey: announcementKeys.receiptsOf(payload.messageId) },
      (data) => patchReceiptsCount(data, payload.confirmedCount),
    );
    scheduleReceiptsRefresh(payload.messageId);
  });

  useEffect(
    () =>
      onRoomResync(() => void queryClient.invalidateQueries({ queryKey: announcementKeys.all })),
    [queryClient],
  );

  useEffect(() => {
    const timers = refreshTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);
}
