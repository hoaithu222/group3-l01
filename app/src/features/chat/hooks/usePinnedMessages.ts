import { useQuery } from '@tanstack/react-query';

import { chatKeys } from '../api/chat.keys';
import { chatService } from '../api/chat.service';
import type { ChatScopeRef } from '../api/chat.types';

/**
 * Tin đã ghim của MỘT phạm vi (mới ghim trước — server sắp `pinnedAt desc`; ≤ 20 kênh / ≤ 10 hội thoại) cho thanh ghim đầu phòng chat.
 *
 * Làm mới KHÔNG cần code ở đây: `useChatRoomSocket` (`pin:updated`) và `useMessageActions` (ghim/bỏ ghim của chính mình) đều
 * `invalidateQueries(chatKeys.pins(scope))` — khoá này đã có sẵn từ p1-04, chỉ thiếu người đọc. `retry: false`: lỗi mạng thì thanh
 * ghim đơn giản không hiện, KHÔNG toast (`chatService.listPins` truyền `skipErrorToast` — thanh ghim là phần trang trí, không được bật
 * thông báo giữa lúc đang nhắn tin), lần mở/làm mới sau tự thử lại.
 */
export function usePinnedMessages(scope: ChatScopeRef) {
  return useQuery({
    queryKey: chatKeys.pins(scope),
    queryFn: () => chatService.listPins(scope),
    enabled: Boolean(scope.scopeId),
    retry: false,
    staleTime: 30_000,
  });
}
