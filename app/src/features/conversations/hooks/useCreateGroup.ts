import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';
import type { ConversationDetail, CreateGroupPayload } from '../api/conversations.types';
import { applyConversationCreated } from '../cache/apply-conversation-event';
import { listQueries } from '../cache/conversation-side-caches';

/** Bước 1 của `CreateGroupScreen` — workspace ACTIVE của tôi (be.md p1-01 §4, gọi thẳng endpoint, xem `conversations.service.ts`). */
export function useMyWorkspaceOptions() {
  return useQuery({
    queryKey: conversationKeys.workspaces(),
    queryFn: () => conversationsService.myWorkspaces(),
    // 0: nhóm của tôi đổi ở feature KHÁC (tham gia/rời/đổi tên) mà không ai làm mới khoá riêng này — mở màn là tải lại nền.
    staleTime: 0,
  });
}

/** `Idempotency-Key` sinh lúc vào bước 3 — nơi gọi (`CreateGroupScreen`) tự giữ khoá qua state, hook chỉ POST. */
export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: CreateGroupPayload; idempotencyKey: string }) =>
      conversationsService.createGroup(payload, idempotencyKey),
    onSuccess: (created: ConversationDetail) => {
      queryClient.setQueryData(conversationKeys.detail(created.id), created);
      // Chèn theo ĐÚNG bộ lọc của từng danh sách (nhóm mới không thuộc "Lưu trữ"/"1-1"); danh sách đang TÌM (`q`) hay lọc theo
      // nhóm làm việc khác thì để server quyết — chèn thẳng vào mọi danh sách là hiện nhóm mới ở cả nơi không được có nó.
      for (const { key, data, filter } of listQueries(queryClient)) {
        const params = key[2] as { q?: string; workspaceId?: string } | undefined;
        if (!data || params?.q || (params?.workspaceId && params.workspaceId !== created.workspaceId)) continue;
        queryClient.setQueryData(key, applyConversationCreated(data, filter, created));
      }
    },
  });
}
