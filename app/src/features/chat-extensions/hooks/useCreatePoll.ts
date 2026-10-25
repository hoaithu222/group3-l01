import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  appendToLatestPage,
  chatKeys,
  flattenMessages,
  isCaughtUpToLatest,
  type ChatScopeRef,
  type MessagesData,
} from '@/features/chat';

import type { CreatePollInput } from '../api/chat-extensions.types';
import { pollService } from '../api/poll.service';

/**
 * Tạo khảo sát = gửi MỘT tin `kind = 'POLL'` (BE tạo qua engine tin nhắn — quyền ghi, idempotency theo `clientMessageId`, realtime `message:created`).
 *
 * Không có bản tạm "đang gửi" trong outbox như tin chữ: bong bóng tạm của `chat` chỉ vẽ được chữ/tệp, còn thẻ khảo sát cần `poll` (lựa chọn/đếm) — dựng giả ở client rồi
 * thay bằng bản thật là thêm một nhánh trạng thái chỉ để tiết kiệm ~1 nhịp mạng. Thay vào đó tấm "Tạo khảo sát" giữ nguyên, nút "Tạo" loading tới khi BE trả 201 (lỗi
 * hiện NGAY trong tấm, không mất câu hỏi đã gõ). `clientMessageId` do tấm sinh MỘT lần mỗi lượt mở: bấm lại/thử lại sau mất mạng không sinh hai khảo sát (replay → 200).
 *
 * Chèn tin vào cache theo đúng luật của `useSendMessage`: socket có thể đã chèn trước khi HTTP về (bỏ qua nếu đã có); cache chưa chạm tin mới nhất → làm mới.
 */
export function useCreatePoll(scope: ChatScopeRef) {
  const queryClient = useQueryClient();
  const queryKey = chatKeys.messages(scope);

  return useMutation({
    mutationFn: (input: CreatePollInput) => pollService.create(scope, input),
    onSuccess: (view) => {
      const current = queryClient.getQueryData<MessagesData>(queryKey);
      if (!current) return;
      if (flattenMessages(current).some((m) => m.id === view.id)) return;
      if (isCaughtUpToLatest(current)) {
        queryClient.setQueryData<MessagesData>(queryKey, appendToLatestPage(current, view));
      } else {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
