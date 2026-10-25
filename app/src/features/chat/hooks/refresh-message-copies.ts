import type { QueryClient } from '@tanstack/react-query';

import { savedKeys, useSavedMessagesStore } from '@/shared/saved';

import { chatKeys } from '../api/chat.keys';
import type { ChatScopeRef, MessageView } from '../api/chat.types';

/**
 * Tin vừa sửa/thu hồi còn BẢN CHÉP ngoài `chatKeys.messages`: thanh ghim đầu phòng (`chatKeys.pins` — BE giữ cờ ghim cả khi thu
 * hồi nên không có `pin:updated`) và trang "Đã lưu" (`savedKeys`, tab Tôi giữ mounted). Không làm mới thì hai nơi đó hiện trích đoạn
 * CŨ tới khi tải lại app. Chỉ làm mới khi tin thật sự có ở đó — sửa tin thường không tốn thêm request nào.
 */
export function refreshMessageCopies(
  queryClient: QueryClient,
  scope: ChatScopeRef,
  messageId: string,
): void {
  const pins = queryClient.getQueryData<MessageView[]>(chatKeys.pins(scope));
  if (pins?.some((message) => message.id === messageId)) {
    void queryClient.invalidateQueries({ queryKey: chatKeys.pins(scope) });
    // Màn "Tin đã ghim" (đầy đủ) dùng khoá của `discovery` (`discovery.keys.ts` `pins`) — ghi tay: `chat` không được import `discovery`.
    void queryClient.invalidateQueries({
      queryKey: ['discovery', 'pins', scope.scopeType, scope.scopeId],
    });
  }
  if (useSavedMessagesStore.getState().ids[messageId]) {
    void queryClient.invalidateQueries({ queryKey: savedKeys.all });
  }
}
