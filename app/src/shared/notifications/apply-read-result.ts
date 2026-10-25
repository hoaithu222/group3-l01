import type { QueryClient } from '@tanstack/react-query';

import {
  notificationKeys,
  type ReadMarkerResult,
  type WorkspaceUnread,
} from '@/core/notifications';

import { applyChannelRead, applyThreadRead } from './unread.cache';

/**
 * Sau khi server nhận mốc đọc: vá LẠC QUAN mọi bản `workspaceUnread` đang cache (số chuẩn của server đến ở lần làm mới sau đó — xem
 * `SUMMARY_REFRESH_AFTER_READ_MS`). Id kênh/luồng là duy nhất toàn hệ thống → không cần biết workspace.
 *
 *  · `CHANNEL`: chấm/số của hàng kênh về 0 khi mốc phủ tới hết `lastSeq`;
 *  · `THREAD`: `streamId` đã chuẩn hoá về `Thread.id` (BE) — đúng khoá của `threads`, nên chấm "N mới" của `ThreadSummaryRow` hạ ngay; chỉ khi
 *    `changed` (không đổi nghĩa là máy khác đã đọc tới đó — số hiện có chưa chắc sai, để server quyết);
 *  · `CONVERSATION`: do màn hội thoại tự vá qua `onMarked` (khoá cache của feature đó).
 */
export function applyReadResult(queryClient: QueryClient, result: ReadMarkerResult): void {
  if (result.streamType === 'CHANNEL') {
    queryClient.setQueriesData<WorkspaceUnread>(
      { queryKey: notificationKeys.workspaceUnreadAll },
      (data) => applyChannelRead(data, result.streamId, result.lastReadSeq),
    );
  } else if (result.streamType === 'THREAD' && result.changed) {
    queryClient.setQueriesData<WorkspaceUnread>(
      { queryKey: notificationKeys.workspaceUnreadAll },
      (data) => applyThreadRead(data, result.streamId),
    );
  }
}
