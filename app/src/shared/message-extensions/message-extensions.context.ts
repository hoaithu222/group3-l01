import { createContext, useContext } from 'react';

import type { MessageExtensionScope } from './message-extensions.types';

/**
 * Phạm vi của phòng chat đang vẽ — `ChatRoom` cấp, `MessageBubble`/`MessageActionSheet` đọc để đưa cho khe mà không phải
 * chuyền prop qua `MessageList` (tám cấp callback đã đủ nặng). `null` = đứng ngoài `ChatRoom` (test riêng lẻ, màn luồng
 * cũ) ⇒ không vẽ khe nào.
 */
export const MessageExtensionScopeContext = createContext<MessageExtensionScope | null>(null);

export function useMessageExtensionScope(): MessageExtensionScope | null {
  return useContext(MessageExtensionScopeContext);
}
