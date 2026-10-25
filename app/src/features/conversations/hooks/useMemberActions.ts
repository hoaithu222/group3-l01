import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatKeys } from '@/features/chat';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';
import type { AddMembersPayload, ConversationDetail } from '../api/conversations.types';
import { removeConversation, type ConversationListData } from '../cache/conversation-list-pages';
import { forgetConversationSideCaches } from '../cache/conversation-side-caches';

/**
 * app.md §4.3 — add/remove/role/transfer/leave/dissolve: KHÔNG optimistic (chờ server, spinner nút), chỉ làm mới cache khi thành công. Mã lỗi `CONV_*` để nơi gọi tự dịch qua `error-codes.ts` (đã sync).
 *
 * ⚠️ Rời/giải tán còn phải dọn DANH SÁCH + mục ghim (màn danh sách vẫn mounted dưới stack): không dọn thì quay về `/messages`
 * vẫn thấy nhóm vừa rời, cho tới khi `conversation:removed` dội về (không đảm bảo có ở máy vừa thao tác).
 */
export function useMemberActions(conversationId: string) {
  const queryClient = useQueryClient();
  const membersKey = conversationKeys.members(conversationId);
  const detailKey = conversationKeys.detail(conversationId);
  const listKey = [...conversationKeys.all, 'list'];
  const invalidateMembers = () => {
    // Tiền tố: `members(id)` mang `q: ''`, không khớp các lượt tìm trong danh sách thành viên.
    void queryClient.invalidateQueries({ queryKey: [...conversationKeys.all, 'members', conversationId] });
    // Gợi ý @nhắc tên lấy theo thành viên — thêm/xoá/đổi vai trò thì gợi ý cũ.
    void queryClient.invalidateQueries({ queryKey: [...chatKeys.all, 'mentionables', 'CONVERSATION', conversationId] });
  };
  const invalidateDetail = () => void queryClient.invalidateQueries({ queryKey: detailKey });

  const addMembers = useMutation({
    mutationFn: (payload: AddMembersPayload) => conversationsService.addMembers(conversationId, payload),
    onSuccess: () => {
      invalidateMembers();
      invalidateDetail();
    },
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'ADMIN' | 'MEMBER' }) =>
      conversationsService.changeRole(conversationId, userId, role),
    onSuccess: invalidateMembers,
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => conversationsService.removeMember(conversationId, userId),
    onSuccess: () => {
      invalidateMembers();
      invalidateDetail();
    },
  });

  const transferOwner = useMutation({
    mutationFn: (toUserId: string) => conversationsService.transferOwner(conversationId, toUserId),
    onSuccess: (detail: ConversationDetail) => {
      queryClient.setQueryData(detailKey, detail);
      invalidateMembers();
    },
  });

  const leave = useMutation({
    mutationFn: () => conversationsService.leave(conversationId),
    onSuccess: () => {
      queryClient.setQueriesData<ConversationListData>({ queryKey: listKey }, (data) =>
        data && Array.isArray(data.pages) ? removeConversation(data, conversationId) : data,
      );
      forgetConversationSideCaches(queryClient, conversationId);
      queryClient.removeQueries({ queryKey: detailKey });
      queryClient.removeQueries({ queryKey: membersKey });
      router.replace('/messages');
    },
  });

  const dissolve = useMutation({
    mutationFn: (confirmTitle: string) => conversationsService.dissolve(conversationId, confirmTitle),
    onSuccess: () => {
      invalidateDetail();
      // Nhóm giải tán đổi trạng thái/chỉ đọc ở hàng danh sách + mục ghim.
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.pinned() });
      router.replace('/messages');
    },
  });

  return { addMembers, changeRole, removeMember, transferOwner, leave, dissolve };
}
