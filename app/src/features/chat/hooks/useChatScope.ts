import { useMemo } from 'react';

import type { ChatScopeRef, ChatScopeType } from '../api/chat.types';

/**
 * Dựng `ChatScopeRef` ỔN ĐỊNH theo tham chiếu — màn cha KHÔNG được viết
 * `<ChatRoom scope={{ scopeType: 'CHANNEL', scopeId: chId }} />` (object
 * literal mới mỗi lần render): `useMessages`/`useChatRoomSocket`/`useSendMessage`
 * đều có `scope` trong mảng phụ thuộc của `useCallback`/`useMemo`/`useEffect`,
 * object mới mỗi render làm chúng chạy lại không cần thiết.
 */
export function useChatScope(scopeType: ChatScopeType, scopeId: string, threadId?: string): ChatScopeRef {
  return useMemo(() => ({ scopeType, scopeId, threadId }), [scopeType, scopeId, threadId]);
}
