import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { chatKeys } from '../api/chat.keys';
import { chatMentionsService } from '../api/chat-mentions.service';
import type { ChatScopeRef } from '../api/chat.types';

/**
 * Gợi ý nhắc tên (`staleTime` 60 s — app.md p1-06 §4.1). `enabled` chỉ bật khi
 * con trỏ đang ở trong một `@từ-khoá` dở dang, nên gõ chữ thường không tốn request.
 *
 * `keepPreviousData`: gõ thêm một chữ thì danh sách CŨ vẫn hiện cho tới khi có kết
 * quả mới — không có nó, mỗi phím làm danh sách chớp về skeleton.
 * `retry: false`: picker lỗi thì ẩn và cho gõ thường, thử lại ngầm chỉ kéo dài lúc đó.
 */
export function useMentionables(
  scope: Pick<ChatScopeRef, 'scopeType' | 'scopeId'>,
  query: string,
  enabled: boolean,
) {
  const q = query.trim();
  return useQuery({
    queryKey: chatKeys.mentionables(scope.scopeType, scope.scopeId, q),
    queryFn: () => chatMentionsService.list(scope, q),
    enabled,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}
