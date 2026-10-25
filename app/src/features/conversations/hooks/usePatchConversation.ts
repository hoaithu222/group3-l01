import { useMutation, useQueryClient } from '@tanstack/react-query';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';
import type { ConversationDetail, PatchConversationPayload } from '../api/conversations.types';
import { findConversation, patchConversation } from '../cache/conversation-list-pages';
import { listQueries, patchPinned } from '../cache/conversation-side-caches';

/**
 * app.md §3 `ConversationInfoScreen` GROUP — sửa tên/ảnh/cài đặt (`membersCanAdd`/`memberCanPin`/`mentionAllRole`). `RES_003` (version lệch) → màn gọi tự đọc `error` rồi tải lại.
 *
 * ⚠️ Vá cả hàng danh sách + mục ghim bằng bản server trả về: danh sách nằm DƯỚI màn Thông tin (vẫn mounted), không vá thì quay lại
 * vẫn thấy tên/ảnh cũ nếu sự kiện `conversation:updated` không dội về máy này.
 */
export function usePatchConversation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PatchConversationPayload) => conversationsService.patch(conversationId, payload),
    onSuccess: (detail: ConversationDetail) => {
      queryClient.setQueryData(conversationKeys.detail(conversationId), detail);
      const patch = <T extends { title: string | null; avatarUrl: string | null }>(item: T): T => ({
        ...item,
        title: detail.title,
        avatarUrl: detail.avatarUrl,
      });
      for (const { key, data } of listQueries(queryClient)) {
        // Chỉ ghi vào danh sách CÓ hàng này — `setQueryData` nào cũng đặt lại `dataUpdatedAt`, làm danh sách khác "tươi" oan.
        if (data && findConversation(data, conversationId)) {
          queryClient.setQueryData(key, patchConversation(data, conversationId, patch));
        }
      }
      patchPinned(queryClient, conversationId, patch);
    },
  });
}
